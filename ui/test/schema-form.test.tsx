import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { describe, expect, it, vi } from "vitest";
import SchemaForm from "../src/components/SchemaForm";
import { buildArguments, schemaToFields, type FieldSpec } from "../src/components/schema";
import type { JsonSchema } from "../src/frank/client";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "A name." },
    count: { type: "integer", description: "How many." },
    ratio: { type: "number", description: "A ratio." },
    level: { enum: [1, 2, 3], description: "A numeric enum." },
    colour: { type: "string", enum: ["red", "green"], description: "A string enum." },
    verbose: { type: "boolean", description: "Optional flag." },
    strict: { type: "boolean", description: "Required flag." },
    filter: { type: "object", description: "Anything else." },
  },
  required: ["name", "strict"],
  additionalProperties: false,
};

function field(fields: FieldSpec[], name: string): FieldSpec {
  const found = fields.find((f) => f.name === name);
  if (!found) throw new Error(`no field ${name}`);
  return found;
}

describe("schemaToFields", () => {
  const fields = schemaToFields(SCHEMA);

  it("maps each property to a widget, checking enum before type", () => {
    expect(Object.fromEntries(fields.map((f) => [f.name, f.widget.kind]))).toEqual({
      name: "string",
      count: "number",
      ratio: "number",
      level: "enum",
      colour: "enum",
      verbose: "optional-boolean",
      strict: "toggle",
      filter: "json",
    });
  });

  it("carries the description and required flag", () => {
    expect(field(fields, "name")).toMatchObject({ description: "A name.", required: true });
    expect(field(fields, "count")).toMatchObject({ description: "How many.", required: false });
  });

  it("turns numeric strings into numbers", () => {
    expect(field(fields, "ratio").toValue("0.5")).toEqual({ kind: "value", value: 0.5 });
    expect(field(fields, "count").toValue("42")).toEqual({ kind: "value", value: 42 });
    expect(field(fields, "count").toValue("0")).toEqual({ kind: "value", value: 0 });
  });

  it("rejects a fractional integer and a non-number", () => {
    expect(field(fields, "count").toValue("3.5")).toEqual({ kind: "error", message: "Enter a whole number." });
    expect(field(fields, "ratio").toValue("abc")).toEqual({ kind: "error", message: "Enter a number." });
  });

  it("keeps a numeric enum's type", () => {
    const level = field(fields, "level");
    const option = level.widget.kind === "enum" ? level.widget.options[1]! : undefined;
    expect(option?.label).toBe("2");
    expect(level.toValue(option!.value)).toEqual({ kind: "value", value: 2 });
    const colour = field(fields, "colour");
    expect(colour.toValue("1")).toEqual({ kind: "value", value: "green" });
  });

  it("leaves an optional boolean unset unless the user sets it, and keeps an explicit false", () => {
    const verbose = field(fields, "verbose");
    expect(verbose.initial).toBeUndefined();
    expect(verbose.toValue(undefined)).toEqual({ kind: "absent" });
    expect(verbose.toValue("false")).toEqual({ kind: "value", value: false });
    expect(verbose.toValue("true")).toEqual({ kind: "value", value: true });
  });

  it("gives a required boolean a value", () => {
    const strict = field(fields, "strict");
    expect(strict.toValue(strict.initial)).toEqual({ kind: "value", value: false });
    expect(strict.toValue(true)).toEqual({ kind: "value", value: true });
  });

  it("omits empty optional fields and flags empty required ones", () => {
    const result = buildArguments(fields, { strict: false, name: "" });
    expect(result).toEqual({ ok: false, errors: { name: "This field is required." } });
    const ok = buildArguments(fields, { name: "frank", strict: false, count: "", verbose: undefined });
    expect(ok).toEqual({ ok: true, args: { name: "frank", strict: false } });
  });

  it("parses JSON fields and reports invalid JSON", () => {
    const filter = field(fields, "filter");
    expect(filter.toValue('{"a":1}')).toEqual({ kind: "value", value: { a: 1 } });
    const bad = filter.toValue("{nope");
    expect(bad.kind).toBe("error");
    expect(bad.kind === "error" && bad.message).toMatch(/^Not valid JSON/);
  });

  it("returns no fields for an empty schema", () => {
    expect(schemaToFields({ type: "object", properties: {} })).toEqual([]);
    expect(schemaToFields(undefined)).toEqual([]);
  });
});

describe("SchemaForm", () => {
  it("with no properties is just a Call button that sends {}", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<SchemaForm schema={{ type: "object", properties: {} }} onSubmit={onSubmit} />);
    const wrapper = createWrapper(container);
    expect(wrapper.findAllFormFields()).toHaveLength(0);
    await userEvent.click(wrapper.findButton()!.getElement());
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("shows an invalid JSON textarea's error and blocks submit", async () => {
    const onSubmit = vi.fn();
    const schema: JsonSchema = {
      type: "object",
      properties: { filter: { type: "object", description: "A filter." } },
    };
    const { container } = render(<SchemaForm schema={schema} onSubmit={onSubmit} />);
    const wrapper = createWrapper(container);
    wrapper.findTextarea()!.setTextareaValue("{nope");
    await userEvent.click(wrapper.findButton()!.getElement());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(wrapper.findFormField()!.findError()!.getElement().textContent).toMatch(/Not valid JSON/);
  });

  it("submits typed values and omits untouched optional fields", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<SchemaForm schema={SCHEMA} onSubmit={onSubmit} />);
    const wrapper = createWrapper(container);
    const inputs = wrapper.findAllInputs();
    // Order follows the schema: name, count, ratio.
    inputs[0]!.setInputValue("frank");
    inputs[1]!.setInputValue("7");
    await userEvent.click(wrapper.findButton()!.getElement());
    expect(onSubmit).toHaveBeenCalledWith({ name: "frank", count: 7, strict: false });
  });

  it("flags a missing required field and does not submit", async () => {
    const onSubmit = vi.fn();
    const { container } = render(<SchemaForm schema={SCHEMA} onSubmit={onSubmit} />);
    const wrapper = createWrapper(container);
    await userEvent.click(wrapper.findButton()!.getElement());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("This field is required.");
  });
});
