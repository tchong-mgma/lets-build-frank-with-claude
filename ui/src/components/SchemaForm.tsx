import { useMemo, useState } from "react";
import Button from "@cloudscape-design/components/button";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import type { JsonSchema } from "../frank/client";
import { buildArguments, schemaToFields, type FieldSpec, type RawValue } from "./schema";

export interface SchemaFormProps {
  schema: JsonSchema;
  submitting?: boolean;
  onSubmit(args: Record<string, unknown>): void;
}

const UNSET: SelectProps.Option = { label: "(unset)", value: "" };
const BOOLEAN_OPTIONS: SelectProps.Option[] = [
  UNSET,
  { label: "true", value: "true" },
  { label: "false", value: "false" },
];

function FieldControl({
  field,
  value,
  invalid,
  onChange,
}: {
  field: FieldSpec;
  value: RawValue;
  invalid: boolean;
  onChange(value: RawValue): void;
}) {
  const { widget } = field;
  switch (widget.kind) {
    case "enum": {
      const options = field.required ? widget.options : [UNSET, ...widget.options];
      const selected = options.find((o) => o.value === value) ?? null;
      return (
        <Select
          selectedOption={selected}
          options={options}
          invalid={invalid}
          placeholder="Choose a value"
          onChange={({ detail }) => onChange(detail.selectedOption.value || undefined)}
        />
      );
    }
    case "string":
      return (
        <Input value={typeof value === "string" ? value : ""} invalid={invalid} onChange={({ detail }) => onChange(detail.value)} />
      );
    case "number":
      return (
        <Input
          type="number"
          inputMode={widget.integer ? "numeric" : "decimal"}
          value={typeof value === "string" ? value : ""}
          invalid={invalid}
          onChange={({ detail }) => onChange(detail.value)}
        />
      );
    case "toggle":
      return (
        <Toggle checked={value === true} onChange={({ detail }) => onChange(detail.checked)}>
          {value === true ? "true" : "false"}
        </Toggle>
      );
    case "optional-boolean": {
      const selected = BOOLEAN_OPTIONS.find((o) => o.value === (value ?? "")) ?? UNSET;
      return (
        <Select
          selectedOption={selected}
          options={BOOLEAN_OPTIONS}
          onChange={({ detail }) => onChange(detail.selectedOption.value || undefined)}
        />
      );
    }
    case "json":
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          invalid={invalid}
          placeholder="JSON"
          onChange={({ detail }) => onChange(detail.value)}
        />
      );
  }
}

/** A form generated from a tool's input schema. New tools need no UI work. */
export default function SchemaForm({ schema, submitting = false, onSubmit }: SchemaFormProps) {
  const fields = useMemo(() => schemaToFields(schema), [schema]);
  const [raw, setRaw] = useState<Record<string, RawValue>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.initial])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const built = buildArguments(fields, raw);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    onSubmit(built.args);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Form
        actions={
          <Button variant="primary" formAction="submit" loading={submitting}>
            Call
          </Button>
        }
      >
        {fields.length > 0 && (
          <SpaceBetween size="m">
            {fields.map((field) => (
              <FormField
                key={field.name}
                label={field.name}
                description={field.description}
                constraintText={field.required ? "Required" : "Optional"}
                errorText={errors[field.name]}
              >
                <FieldControl
                  field={field}
                  value={raw[field.name]}
                  invalid={Boolean(errors[field.name])}
                  onChange={(value) => {
                    setRaw((prev) => ({ ...prev, [field.name]: value }));
                    setErrors((prev) => {
                      if (!(field.name in prev)) return prev;
                      const next = { ...prev };
                      delete next[field.name];
                      return next;
                    });
                  }}
                />
              </FormField>
            ))}
          </SpaceBetween>
        )}
      </Form>
    </form>
  );
}
