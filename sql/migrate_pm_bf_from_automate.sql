-- Migração única dos benefícios para a tabela escolar.
-- Execute no SQL Editor do Supabase.
-- Para outra escola, altere apenas o valor de v_school_table.

BEGIN;

DO $$
DECLARE
  v_school_table TEXT := 'DOMBOSCO';
  v_source_table TEXT := 'PM-BF-AUTOMATE';
  v_updated_rows INTEGER;
BEGIN
  IF to_regclass(format('public.%I', v_source_table)) IS NULL THEN
    RAISE EXCEPTION 'Tabela de origem não encontrada: public.%', v_source_table;
  END IF;

  IF to_regclass(format('public.%I', v_school_table)) IS NULL THEN
    RAISE EXCEPTION 'Tabela escolar não encontrada: public.%', v_school_table;
  END IF;

  EXECUTE format(
    $sql$
      UPDATE public.%I AS escola
      SET "PM-BF" = CASE
        WHEN NULLIF(BTRIM(automate."PM"::TEXT), '') IS NULL
         AND NULLIF(BTRIM(automate."BF"::TEXT), '') IS NULL
          THEN NULL
        ELSE CONCAT_WS(
          ', ',
          COALESCE(NULLIF(BTRIM(automate."PM"::TEXT), ''), 'Não informado'),
          COALESCE(NULLIF(BTRIM(automate."BF"::TEXT), ''), 'Não informado')
        )
      END
      FROM public.%I AS automate
      WHERE escola."MAT" = automate."MAT"
    $sql$,
    v_school_table,
    v_source_table
  );

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  RAISE NOTICE 'Migração concluída para %. Linhas atualizadas: %', v_school_table, v_updated_rows;
END;
$$;

COMMIT;

-- Regras aplicadas:
-- PM = 'Sim', BF = 'Não'                  -> 'Sim, Não'
-- PM = 'Não', BF = NULL                   -> 'Não, Não informado'
-- PM = NULL, BF = 'Sim'                   -> 'Não informado, Sim'
-- PM = NULL, BF = NULL (ou ambos vazios)  -> NULL
