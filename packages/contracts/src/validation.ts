import type { ZodType } from "zod";

export interface ContractIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type ContractValidationResult<Output> =
  | { readonly success: true; readonly data: Output }
  | { readonly success: false; readonly issues: readonly ContractIssue[] };

export function validateContract<Output>(
  schema: ZodType<Output>,
  input: unknown,
): ContractValidationResult<Output> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map(String).join("."),
    })),
  };
}
