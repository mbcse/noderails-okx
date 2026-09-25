export interface OfframpBeneficiaryProvider {
  readonly name: string;
  create(body: Record<string, unknown>): Promise<{ id: string }>;
}
