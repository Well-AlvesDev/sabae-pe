-- Crie essa função SQL no SQL Editor do Supabase
-- Esta RPC processa todos os registros de chamada em uma única transação

CREATE OR REPLACE FUNCTION public.tem_acesso(nome_tabela TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permissoes
    WHERE usuario_id = auth.uid()
      AND tabela_nome = nome_tabela
  );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_attendance_cache(
  attendance_data JSONB,
  table_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{"success": 0, "failed": 0, "errors": []}';
  v_day INT;
  v_day_column TEXT;
BEGIN
  table_name := btrim(table_name);

  IF table_name IS NULL OR table_name = '' OR table_name !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
    RAISE EXCEPTION 'Nome de tabela inválido: %', table_name;
  END IF;

  IF to_regclass(format('public.%I', table_name)) IS NULL THEN
    RAISE EXCEPTION 'Tabela não encontrada no schema public: %', table_name;
  END IF;

  -- Validação de entrada
  IF attendance_data IS NULL OR attendance_data = '[]'::JSONB THEN
    RETURN v_result;
  END IF;

  CREATE TEMP TABLE tmp_attendance_batch (
    item_id BIGINT GENERATED ALWAYS AS IDENTITY,
    mat TEXT,
    dia INT,
    mes INT,
    presenca TEXT,
    nome TEXT,
    valido BOOLEAN NOT NULL DEFAULT TRUE,
    encontrado BOOLEAN NOT NULL DEFAULT FALSE,
    erro TEXT
  ) ON COMMIT DROP;

  -- Converter o JSON em linhas uma única vez, antes de acessar a tabela de alunos.
  INSERT INTO tmp_attendance_batch (mat, dia, mes, presenca, nome)
  SELECT
    NULLIF(BTRIM(registro.mat), ''),
    NULLIF(BTRIM(registro.dia), '')::INT,
    NULLIF(BTRIM(registro.mes), '')::INT,
    NULLIF(BTRIM(registro.presenca), ''),
    NULLIF(BTRIM(registro.nome), '')
  FROM jsonb_to_recordset(attendance_data) AS registro(
    mat TEXT,
    dia TEXT,
    mes TEXT,
    presenca TEXT,
    nome TEXT
  );

  -- Manter a validação e as mensagens compatíveis com a RPC anterior.
  UPDATE tmp_attendance_batch
  SET
    valido = FALSE,
    erro = CASE
      WHEN mat IS NULL OR dia IS NULL OR mes IS NULL OR presenca IS NULL
        THEN 'Aluno inválido: matrícula, dia, mês ou presença ausentes.'
      WHEN dia < 1 OR dia > 31
        THEN 'Dia inválido: ' || dia::TEXT
      WHEN mes < 1 OR mes > 12
        THEN 'Mês inválido: ' || mes::TEXT
      ELSE NULL
    END
  WHERE mat IS NULL
     OR dia IS NULL
     OR mes IS NULL
     OR presenca IS NULL
     OR dia NOT BETWEEN 1 AND 31
     OR mes NOT BETWEEN 1 AND 12;

  -- O modelo atual ainda possui uma coluna por dia. A consulta é agrupada por
  -- dia para fazer um UPDATE em lote por coluna, em vez de um por aluno.
  FOR v_day IN
    SELECT DISTINCT dia
    FROM tmp_attendance_batch
    WHERE valido
    ORDER BY dia
  LOOP
    v_day_column := v_day::TEXT;

    EXECUTE format(
      'WITH valores AS (
         SELECT
           lote.item_id,
           lote.mat,
           lote.mes,
           lote.presenca,
           COALESCE(NULLIF(aluno.%I::TEXT, ''''), '''') AS valor_atual
         FROM tmp_attendance_batch lote
         JOIN public.%I aluno
           ON BTRIM(aluno."MAT"::TEXT) = lote.mat
         WHERE lote.valido = TRUE
           AND lote.dia = $1
       ), novos_valores AS (
         SELECT
           item_id,
           mat,
           CASE
             WHEN regexp_replace(
               valor_atual,
               ''(^|,)[[:space:]]*(P|FNJ|FJ):'' || mes::TEXT || ''([[:space:]]*,|$)'',
               ''\1'' || presenca || '':'' || mes::TEXT || ''\3''
             ) = valor_atual
             THEN CASE
               WHEN valor_atual = '''' THEN presenca || '':'' || mes::TEXT
               ELSE valor_atual || '','' || presenca || '':'' || mes::TEXT
             END
             ELSE regexp_replace(
               valor_atual,
               ''(^|,)[[:space:]]*(P|FNJ|FJ):'' || mes::TEXT || ''([[:space:]]*,|$)'',
               ''\1'' || presenca || '':'' || mes::TEXT || ''\3''
             )
           END AS novo_valor
         FROM valores
       )
       UPDATE public.%I aluno
       SET %I = novos.novo_valor
       FROM novos_valores novos
       WHERE BTRIM(aluno."MAT"::TEXT) = novos.mat',
      v_day_column,
      table_name,
      table_name,
      v_day_column
    ) USING v_day;

    EXECUTE format(
      'UPDATE tmp_attendance_batch lote
       SET encontrado = TRUE
       FROM public.%I aluno
       WHERE lote.valido = TRUE
         AND lote.dia = $1
         AND BTRIM(aluno."MAT"::TEXT) = lote.mat',
      table_name
    ) USING v_day;
  END LOOP;

  UPDATE tmp_attendance_batch
  SET
    valido = FALSE,
    erro = 'Nenhuma linha encontrada para matrícula ' || mat || ' (' || COALESCE(nome, 'nome ausente') || ')'
  WHERE valido AND NOT encontrado;

  SELECT jsonb_build_object(
    'success', COUNT(*) FILTER (WHERE valido AND encontrado),
    'failed', COUNT(*) FILTER (WHERE NOT (valido AND encontrado)),
    'errors', COALESCE(array_agg(erro) FILTER (WHERE erro IS NOT NULL), ARRAY[]::TEXT[])
  )
  INTO v_result
  FROM tmp_attendance_batch;

  RETURN v_result;
END;
$$;

-- Conceder permissões para a função (apenas usuários autenticados)
GRANT EXECUTE ON FUNCTION public.send_attendance_cache(JSONB, TEXT) TO authenticated;

-- Ao inserir um aluno, replica como presente todos os meses que ja possuem
-- chamada registrada para a turma em cada dia utilizado.
CREATE OR REPLACE FUNCTION public.backfill_student_attendance(
  p_mat TEXT,
  p_turma TEXT,
  p_table_name TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day INT;
  v_months TEXT;
  v_new_value TEXT;
  v_updated_days INT := 0;
BEGIN
  p_table_name := btrim(p_table_name);

  IF p_table_name IS NULL OR p_table_name = '' OR p_table_name !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
    RAISE EXCEPTION 'Nome de tabela inválido: %', p_table_name;
  END IF;

  IF to_regclass(format('public.%I', p_table_name)) IS NULL THEN
    RAISE EXCEPTION 'Tabela não encontrada no schema public: %', p_table_name;
  END IF;

  FOR v_day IN 1..31 LOOP
    EXECUTE format(
      'SELECT string_agg(DISTINCT matches[1], '','' ORDER BY matches[1])
       FROM public.%I source_row
       CROSS JOIN LATERAL regexp_matches(
         COALESCE(source_row.%I::TEXT, ''''),
         ''(?:P|FNJ|FJ):([0-9]{1,2})'',
         ''g''
       ) AS matches
       WHERE TRIM(source_row."TURMA"::TEXT) = TRIM($1)
         AND TRIM(source_row."MAT"::TEXT) <> TRIM($2)',
      p_table_name,
      v_day
    ) INTO v_months USING p_turma, p_mat;

    IF v_months IS NOT NULL THEN
      SELECT string_agg('P:' || month_value, ',' ORDER BY month_value)
      INTO v_new_value
      FROM unnest(string_to_array(v_months, ',')) AS month_values(month_value);

      EXECUTE format(
        'UPDATE public.%I SET %I = $1 WHERE TRIM("MAT"::TEXT) = TRIM($2)',
        p_table_name,
        v_day
      ) USING v_new_value, p_mat;
      v_updated_days := v_updated_days + 1;
    END IF;
  END LOOP;

  RETURN v_updated_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_student_attendance(TEXT, TEXT, TEXT) TO authenticated;

-- Remove tokens de chamada invalidos e duplicados das colunas 1 a 31.
-- Exemplos:
--   'FJ:8, FNJ:'  -> 'FJ:8'
--   'FNJ:4, FNJ:4' -> 'FNJ:4'
--   'P:3, FJ:3' -> 'FJ:3' (um unico status por mes; o ultimo token valido prevalece)
CREATE OR REPLACE FUNCTION public.normalize_attendance_value(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_token TEXT;
  v_status TEXT;
  v_month INT;
  v_index INT;
  v_months INT[] := ARRAY[]::INT[];
  v_normalized TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  FOREACH v_token IN ARRAY string_to_array(p_value, ',') LOOP
    v_token := btrim(v_token);
    v_status := substring(v_token FROM '^(P|FNJ|FJ):');
    v_month := NULLIF(substring(v_token FROM '^(?:P|FNJ|FJ):([0-9]{1,2})$'), '')::INT;

    -- Descarta tokens sem mes, com mes invalido ou com formato incorreto.
    IF v_status IS NULL OR v_month IS NULL OR v_month < 1 OR v_month > 12 THEN
      CONTINUE;
    END IF;

    -- Mantem exatamente um status por mes; o ultimo token valido prevalece.
    v_index := array_position(v_months, v_month);
    IF v_index IS NULL THEN
      v_months := array_append(v_months, v_month);
      v_normalized := array_append(v_normalized, v_status || ':' || v_month::TEXT);
    ELSE
      v_normalized[v_index] := v_status || ':' || v_month::TEXT;
    END IF;
  END LOOP;

  RETURN NULLIF(array_to_string(v_normalized, ','), '');
END;
$$;

-- Corrige os dados ja gravados nas tabelas configuradas.
DO $$
DECLARE
  v_day INT;
  v_table_name TEXT;
BEGIN
  FOR v_table_name IN
    SELECT DISTINCT tabela_nome
    FROM public.permissoes
    WHERE tabela_nome ~ '^[A-Za-z_][A-Za-z0-9_]*$'
      AND to_regclass(format('public.%I', tabela_nome)) IS NOT NULL
  LOOP
    FOR v_day IN 1..31 LOOP
      EXECUTE format(
        'UPDATE public.%I SET %I = public.normalize_attendance_value(%I::TEXT)
         WHERE %I IS NOT NULL
           AND %I::TEXT IS DISTINCT FROM public.normalize_attendance_value(%I::TEXT)',
        v_table_name, v_day, v_day, v_day, v_day, v_day
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Normaliza automaticamente novos INSERTs e UPDATEs.
CREATE OR REPLACE FUNCTION public.normalize_attendance_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_day INT;
BEGIN
  FOR v_day IN 1..31 LOOP
    NEW := jsonb_populate_record(
      NEW,
      jsonb_build_object(
        v_day::TEXT,
        public.normalize_attendance_value(to_jsonb(NEW)->>v_day::TEXT)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table_name TEXT;
BEGIN
  FOR v_table_name IN
    SELECT DISTINCT tabela_nome
    FROM public.permissoes
    WHERE tabela_nome ~ '^[A-Za-z_][A-Za-z0-9_]*$'
      AND to_regclass(format('public.%I', tabela_nome)) IS NOT NULL
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS normalize_attendance_columns_trigger ON public.%I', v_table_name);
    EXECUTE format(
      'CREATE TRIGGER normalize_attendance_columns_trigger
       BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.normalize_attendance_columns()',
      v_table_name
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_attendance_value(TEXT) TO authenticated;
