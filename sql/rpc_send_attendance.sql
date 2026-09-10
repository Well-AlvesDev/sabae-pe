-- Crie essa função SQL no SQL Editor do Supabase
-- Esta RPC processa todos os registros de chamada em uma única transação

CREATE OR REPLACE FUNCTION public.send_attendance_cache(
  attendance_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINE
AS $$
DECLARE
  v_result JSONB := '{"success": 0, "failed": 0, "errors": []}';
  v_success INT := 0;
  v_failed INT := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_item JSONB;
  v_mat TEXT;
  v_dia INT;
  v_mes INT;
  v_presenca TEXT;
  v_nome TEXT;
  v_day_column TEXT;
  v_existing_value TEXT;
  v_new_value TEXT;
  v_update_result INT;
BEGIN
  -- Validação de entrada
  IF attendance_data IS NULL OR attendance_data = '[]'::JSONB THEN
    RETURN v_result;
  END IF;

  -- Processar cada registro de attendance
  FOR v_item IN
    SELECT jsonb_array_elements(attendance_data)
  LOOP
    -- Extrair dados do item
    v_mat := NULLIF(TRIM(v_item->>'mat'), '');
    v_dia := (v_item->>'dia')::INT;
    v_mes := (v_item->>'mes')::INT;
    v_presenca := v_item->>'presenca';
    v_nome := v_item->>'nome';

    -- Validar dados obrigatórios
    IF v_mat IS NULL OR v_dia IS NULL OR v_mes IS NULL OR v_presenca IS NULL THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Aluno inválido: matrícula, dia, mês ou presença ausentes.');
      CONTINUE;
    END IF;

    -- Validar formato de dia
    IF v_dia < 1 OR v_dia > 31 THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Dia inválido: ' || v_dia::TEXT);
      CONTINUE;
    END IF;

    -- Validar formato de mês
    IF v_mes < 1 OR v_mes > 12 THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Mês inválido: ' || v_mes::TEXT);
      CONTINUE;
    END IF;

    v_day_column := v_dia::TEXT;

    -- Buscar valor existente
    SELECT COALESCE(NULLIF((tbda_row->>v_day_column), ''), '')
    INTO v_existing_value
    FROM (
      SELECT jsonb_object_agg(key, value) AS tbda_row
      FROM jsonb_each_text((SELECT row_to_json(t.*)::JSONB FROM "TBDA" t WHERE TRIM("MAT"::TEXT) = v_mat LIMIT 1))
    ) subq;

    -- Se não achou a matrícula
    IF v_existing_value IS NULL THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Nenhuma linha encontrada para matrícula ' || v_mat::TEXT || ' (' || COALESCE(v_nome, 'nome ausente') || ')');
      CONTINUE;
    END IF;

    -- Substituir o status deste mês e preservar os status dos demais meses.
    v_new_value := regexp_replace(
      v_existing_value,
      '(^|,)[[:space:]]*(P|FNJ|FJ):' || v_mes::TEXT || '([[:space:]]*,|$)',
      '\1' || v_presenca || ':' || v_mes::TEXT || '\3'
    );

    IF v_new_value = v_existing_value THEN
      v_new_value := CASE
        WHEN v_existing_value = '' THEN v_presenca || ':' || v_mes::TEXT
        ELSE v_existing_value || ',' || v_presenca || ':' || v_mes::TEXT
      END;
    END IF;

    -- Executar update
    EXECUTE format('UPDATE "TBDA" SET %I = %L WHERE TRIM("MAT"::TEXT) = %L', v_day_column, v_new_value, v_mat);

    GET DIAGNOSTICS v_update_result = ROW_COUNT;

    IF v_update_result > 0 THEN
      v_success := v_success + 1;
    ELSE
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Falha ao atualizar matrícula ' || v_mat);
    END IF;

  END LOOP;

  -- Montar resultado final
  v_result := jsonb_build_object(
    'success', v_success,
    'failed', v_failed,
    'errors', v_errors
  );

  RETURN v_result;
END;
$$;

-- Conceder permissões para a função (apenas usuários autenticados)
GRANT EXECUTE ON FUNCTION public.send_attendance_cache(JSONB) TO authenticated;

-- Ao inserir um aluno, replica como presente todos os meses que ja possuem
-- chamada registrada para a turma em cada dia utilizado.
CREATE OR REPLACE FUNCTION public.backfill_student_attendance(
  p_mat TEXT,
  p_turma TEXT
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
  FOR v_day IN 1..31 LOOP
    EXECUTE format(
      'SELECT string_agg(DISTINCT matches[1], '','' ORDER BY matches[1])
       FROM "TBDA" source_row
       CROSS JOIN LATERAL regexp_matches(
         COALESCE(source_row.%I::TEXT, ''''),
         ''(?:P|FNJ|FJ):([0-9]{1,2})'',
         ''g''
       ) AS matches
       WHERE TRIM(source_row."TURMA"::TEXT) = TRIM($1)
         AND TRIM(source_row."MAT"::TEXT) <> TRIM($2)',
      v_day
    ) INTO v_months USING p_turma, p_mat;

    IF v_months IS NOT NULL THEN
      SELECT string_agg('P:' || month_value, ',' ORDER BY month_value)
      INTO v_new_value
      FROM unnest(string_to_array(v_months, ',')) AS month_values(month_value);

      EXECUTE format(
        'UPDATE "TBDA" SET %I = $1 WHERE TRIM("MAT"::TEXT) = TRIM($2)',
        v_day
      ) USING v_new_value, p_mat;
      v_updated_days := v_updated_days + 1;
    END IF;
  END LOOP;

  RETURN v_updated_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_student_attendance(TEXT, TEXT) TO authenticated;

-- Remove tokens de chamada invalidos e duplicados das colunas 1 a 31.
-- Exemplos:
--   'FJ:8, FNJ:'  -> 'FJ:8'
--   'FNJ:4, FNJ:4' -> 'FNJ:4'
--   'P:3, FJ:3' -> 'P:3, FJ:3' (mesmo mes, mas status diferente: preserva ambos)
CREATE OR REPLACE FUNCTION public.normalize_tbda_attendance_value(
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

    -- Mantem a primeira ocorrencia exata e descarta apenas a duplicata.
    IF NOT (v_status || ':' || v_month::TEXT = ANY(v_normalized)) THEN
      v_normalized := array_append(v_normalized, v_status || ':' || v_month::TEXT);
    END IF;
  END LOOP;

  RETURN NULLIF(array_to_string(v_normalized, ','), '');
END;
$$;

-- Corrige os dados que ja estao gravados.
DO $$
DECLARE
  v_day INT;
BEGIN
  FOR v_day IN 1..31 LOOP
    EXECUTE format(
      'UPDATE "TBDA" SET %I = public.normalize_tbda_attendance_value(%I::TEXT)
       WHERE %I IS NOT NULL
         AND %I::TEXT IS DISTINCT FROM public.normalize_tbda_attendance_value(%I::TEXT)',
      v_day, v_day, v_day, v_day, v_day
    );
  END LOOP;
END;
$$;

-- Normaliza automaticamente novos INSERTs e UPDATEs.
CREATE OR REPLACE FUNCTION public.normalize_tbda_attendance_columns()
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
        public.normalize_tbda_attendance_value(to_jsonb(NEW)->>v_day::TEXT)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_tbda_attendance_columns_trigger ON "TBDA";
CREATE TRIGGER normalize_tbda_attendance_columns_trigger
BEFORE INSERT OR UPDATE ON "TBDA"
FOR EACH ROW
EXECUTE FUNCTION public.normalize_tbda_attendance_columns();

GRANT EXECUTE ON FUNCTION public.normalize_tbda_attendance_value(TEXT) TO authenticated;
