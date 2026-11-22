import { useForm, type FieldValues, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod/v4";
import { haptics } from "@/lib/haptics";

/**
 * react-hook-form over a sheet's own state (gaps row 118): `values` is what the sheet holds,
 * the zod schema checks it, and every field's problem lands in `fieldError(name)` at once.
 * A change to any value clears them, as rhf does for `values`. `submit(onValid)` buzzes once
 * when a field is wrong; the sheet's own `useFormError` covers the server's answer.
 */
export const useSchemaForm = <T extends FieldValues>(schema: z.ZodType, values: T) => {
  const form = useForm<T>({ resolver: zodResolver(schema as never) as unknown as Resolver<T>, values, mode: "onSubmit" });
  const fieldError = (name: string): string | undefined => {
    const e = (form.formState.errors as Record<string, { message?: unknown } | undefined>)[name];
    return typeof e?.message === "string" ? e.message : undefined;
  };
  const submit = (onValid: () => void | Promise<void>) => form.handleSubmit(async () => { await onValid(); }, () => haptics.error())();
  /** A server issue that names a field (`splitIssues`), shown under it like a schema problem. */
  const setFieldError = (name: string, error: { message: string }) => form.setError(name as Path<T>, error);
  return { fieldError, submit, setFieldError };
};
