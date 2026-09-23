import type { JsonSchema } from "../frank/client";

/**
 * Pure mapping from a tool's JSON input schema to form fields (ADR-003), so a
 * new tool needs no UI work. Kept apart from the React component so it can be
 * tested on its own.
 */

/** What the user has entered. `undefined` means the user never set it. */
export type RawValue = string | boolean | undefined;

export type FieldValue =
  | { kind: "absent" }
  | { kind: "value"; value: unknown }
  | { kind: "error"; message: string };

export type Widget =
  | { kind: "enum"; options: Array<{ label: string; value: string }> }
  | { kind: "string" }
  | { kind: "number"; integer: boolean }
  | { kind: "toggle" }
  | { kind: "optional-boolean" }
  | { kind: "json" };

export interface FieldSpec {
  name: string;
  description?: string;
  required: boolean;
  widget: Widget;
  /** The raw value a fresh form starts with. */
  initial: RawValue;
  /** Converts what the user entered into an argument value. */
  toValue(raw: RawValue): FieldValue;
}

const ABSENT: FieldValue = { kind: "absent" };
const REQUIRED: FieldValue = { kind: "error", message: "This field is required." };

function primaryType(schema: JsonSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null");
  return schema.type;
}

function enumLabel(value: unknown): string {
  if (value === "") return "(empty string)";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function blank(raw: RawValue): boolean {
  return raw === undefined || (typeof raw === "string" && raw.trim() === "");
}

function fieldFor(name: string, schema: JsonSchema, required: boolean): FieldSpec {
  const base = { name, description: schema.description, required };
  const missing = () => (required ? REQUIRED : ABSENT);

  // enum before type: a numeric enum is still a choice, not a number box.
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum;
    // Select values must be strings, so use the index and map back to the
    // original value, which keeps numbers as numbers.
    const options = values.map((value, index) => ({ label: enumLabel(value), value: String(index) }));
    return {
      ...base,
      widget: { kind: "enum", options },
      initial: undefined,
      toValue(raw) {
        if (raw === undefined || raw === "") return missing();
        const index = Number(raw);
        if (!Number.isInteger(index) || index < 0 || index >= values.length) {
          return { kind: "error", message: "Choose one of the listed values." };
        }
        return { kind: "value", value: values[index] };
      },
    };
  }

  switch (primaryType(schema)) {
    case "string":
      return {
        ...base,
        widget: { kind: "string" },
        initial: undefined,
        toValue: (raw) => (raw === undefined || raw === "" ? missing() : { kind: "value", value: String(raw) }),
      };

    case "number":
    case "integer": {
      const integer = primaryType(schema) === "integer";
      return {
        ...base,
        widget: { kind: "number", integer },
        initial: undefined,
        toValue(raw) {
          if (blank(raw)) return missing();
          // Cloudscape's number input still hands back a string.
          const value = Number(raw);
          if (!Number.isFinite(value)) return { kind: "error", message: "Enter a number." };
          if (integer && !Number.isInteger(value)) return { kind: "error", message: "Enter a whole number." };
          return { kind: "value", value };
        },
      };
    }

    case "boolean":
      if (required) {
        // A required boolean always has a value, so a Toggle can express it.
        return {
          ...base,
          widget: { kind: "toggle" },
          initial: false,
          toValue: (raw) => ({ kind: "value", value: raw === true }),
        };
      }
      // A Toggle can't say "not supplied", so an optional boolean is a
      // three-way choice: (unset) / true / false.
      return {
        ...base,
        widget: { kind: "optional-boolean" },
        initial: undefined,
        toValue(raw) {
          if (raw === "true" || raw === true) return { kind: "value", value: true };
          if (raw === "false" || raw === false) return { kind: "value", value: false };
          return ABSENT;
        },
      };

    default:
      // Objects, arrays and anything else: JSON typed by hand.
      return {
        ...base,
        widget: { kind: "json" },
        initial: undefined,
        toValue(raw) {
          if (blank(raw)) return missing();
          try {
            return { kind: "value", value: JSON.parse(String(raw)) };
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { kind: "error", message: `Not valid JSON: ${detail}` };
          }
        },
      };
  }
}

export function schemaToFields(schema: JsonSchema | undefined): FieldSpec[] {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return Object.entries(properties).map(([name, prop]) => fieldFor(name, prop ?? {}, required.has(name)));
}

/**
 * Builds the `arguments` object. Absent fields are left out so server
 * defaults still apply. Returns per-field errors instead if any field is invalid.
 */
export function buildArguments(
  fields: FieldSpec[],
  raw: Record<string, RawValue>,
): { ok: true; args: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const result = field.toValue(raw[field.name]);
    if (result.kind === "error") errors[field.name] = result.message;
    else if (result.kind === "value") args[field.name] = result.value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, args };
}
