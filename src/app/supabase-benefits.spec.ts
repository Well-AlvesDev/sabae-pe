import { describe, expect, it } from 'vitest';
import { formatStudentBenefitsCellValue, parseStudentBenefitsCellValue } from './supabase';

describe('student benefits persistence', () => {
  it('stores both benefit statuses in a single PM-BF cell', () => {
    expect(formatStudentBenefitsCellValue('sim', 'nao')).toBe('sim, não');
    expect(formatStudentBenefitsCellValue('nao', 'sim')).toBe('não, sim');
    expect(formatStudentBenefitsCellValue('sim', 'nao-informado')).toBe('sim, não informado');
    expect(formatStudentBenefitsCellValue('nao-informado', 'nao')).toBe('não informado, não');
  });

  it('reads a combined benefit value back into the two selections', () => {
    expect(parseStudentBenefitsCellValue('sim, não')).toEqual({ peDeMeia: 'sim', bolsaFamilia: 'nao' });
    expect(parseStudentBenefitsCellValue('não, sim')).toEqual({ peDeMeia: 'nao', bolsaFamilia: 'sim' });
  });

  it('uses não informado when PM-BF is empty', () => {
    expect(parseStudentBenefitsCellValue(null)).toEqual({ peDeMeia: 'nao-informado', bolsaFamilia: 'nao-informado' });
    expect(parseStudentBenefitsCellValue('')).toEqual({ peDeMeia: 'nao-informado', bolsaFamilia: 'nao-informado' });
  });

  it('keeps an omitted benefit as não informado', () => {
    expect(parseStudentBenefitsCellValue('não informado')).toEqual({ peDeMeia: 'nao-informado', bolsaFamilia: 'nao-informado' });
    expect(parseStudentBenefitsCellValue('sim')).toEqual({ peDeMeia: 'sim', bolsaFamilia: 'nao-informado' });
  });
});
