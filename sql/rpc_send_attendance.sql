-- Crie essa função SQL no SQL Editor do Supabase
-- Esta RPC processa todos os registros de chamada em uma única transação

CREATE OR REPLACE FUNCTION public.send_attendance_cache(
  attendance_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{"success": 0, "failed": 0, "errors": []}';
  v_success INT := 0;
  v_failed INT := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_item JSONB;
  v_mat INT;
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
    v_mat := (v_item->>'mat')::INT;
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
      FROM jsonb_each_text((SELECT row_to_json(t.*)::JSONB FROM "TBDA" t WHERE "MAT" = v_mat LIMIT 1))
    ) subq;

    -- Se não achou a matrícula
    IF v_existing_value IS NULL THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Nenhuma linha encontrada para matrícula ' || v_mat::TEXT || ' (' || COALESCE(v_nome, 'nome ausente') || ')');
      CONTINUE;
    END IF;

    -- Montar novo valor (append presença + mês)
    IF v_existing_value = '' THEN
      v_new_value := v_presenca || ':' || v_mes::TEXT;
    ELSE
      -- Verificar se já existe este token
      IF v_existing_value LIKE '%' || v_presenca || ':' || v_mes::TEXT || '%' THEN
        v_new_value := v_existing_value;
      ELSE
        v_new_value := v_existing_value || ',' || v_presenca || ':' || v_mes::TEXT;
      END IF;
    END IF;

    -- Executar update
    EXECUTE format('UPDATE "TBDA" SET %I = %L WHERE "MAT" = %L', v_day_column, v_new_value, v_mat);

    GET DIAGNOSTICS v_update_result = ROW_COUNT;

    IF v_update_result > 0 THEN
      v_success := v_success + 1;
    ELSE
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Falha ao atualizar matrícula ' || v_mat::TEXT);
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
