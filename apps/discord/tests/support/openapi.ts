/**
 * Hand-rolled OpenAPI component-schema reader for consumer contract tests.
 * No YAML dependency: only the shapes these tests assert.
 */

export interface PropertySchema {
  type?: string | string[];
  enum?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  const?: string | number | boolean;
  properties?: Record<string, PropertySchema>;
}

export interface ObjectSchema {
  required: string[];
  properties: Record<string, PropertySchema>;
  additionalProperties: boolean;
}

function readSequence(
  block: string[],
  name: string,
  indent: number,
): string[] | undefined {
  const prefix = `${' '.repeat(indent)}${name}:`;
  const declaration = block.findIndex((line) => line.startsWith(prefix));
  if (declaration < 0) return undefined;

  const value = block[declaration]?.slice(prefix.length).trim();
  if (value === undefined) throw new Error(`schema ${name} is unreadable`);
  if (value.length > 0) {
    const inline = value.match(/^\[([^\]]*)\]$/);
    if (!inline) throw new Error(`schema ${name} must be a sequence`);
    return inline[1]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  const items: string[] = [];
  for (const line of block.slice(declaration + 1)) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) break;

    const item = line.match(new RegExp(`^ {${indent + 2}}-\\s+(.+?)\\s*$`));
    if (!item) throw new Error(`schema ${name} contains an unreadable item`);
    items.push(item[1]);
  }
  if (items.length === 0) throw new Error(`schema ${name} sequence is empty`);
  return items;
}

function parseConst(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readPropertyFields(
  block: string[],
  startIndex: number,
  fieldIndent: number,
): PropertySchema {
  const property: PropertySchema = {};

  for (let index = startIndex; index < block.length; index += 1) {
    const line = block[index] ?? '';
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent < fieldIndent) break;
    if (lineIndent !== fieldIndent) continue;

    const typeInline = line.match(new RegExp(`^ {${fieldIndent}}type:\\s*(\\w+)\\s*$`));
    if (typeInline) {
      property.type = typeInline[1];
      continue;
    }
    if (new RegExp(`^ {${fieldIndent}}type:\\s*$`).test(line)) {
      const values = readSequence(block.slice(index), 'type', fieldIndent);
      if (values) property.type = values.map(stripQuotes);
      continue;
    }
    if (new RegExp(`^ {${fieldIndent}}enum:`).test(line)) {
      const values = readSequence(block.slice(index), 'enum', fieldIndent);
      if (values) property.enum = values;
      continue;
    }
    const format = line.match(new RegExp(`^ {${fieldIndent}}format:\\s*(\\S+)\\s*$`));
    if (format) {
      property.format = format[1];
      continue;
    }
    const minimum = line.match(
      new RegExp(`^ {${fieldIndent}}minimum:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`),
    );
    if (minimum) {
      property.minimum = Number(minimum[1]);
      continue;
    }
    const maximum = line.match(
      new RegExp(`^ {${fieldIndent}}maximum:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`),
    );
    if (maximum) {
      property.maximum = Number(maximum[1]);
      continue;
    }
    const maxLength = line.match(
      new RegExp(`^ {${fieldIndent}}maxLength:\\s*(\\d+)\\s*$`),
    );
    if (maxLength) {
      property.maxLength = Number(maxLength[1]);
      continue;
    }
    const maxItems = line.match(
      new RegExp(`^ {${fieldIndent}}maxItems:\\s*(\\d+)\\s*$`),
    );
    if (maxItems) {
      property.maxItems = Number(maxItems[1]);
      continue;
    }
    const constMatch = line.match(
      new RegExp(`^ {${fieldIndent}}const:\\s*(.+?)\\s*$`),
    );
    if (constMatch) {
      property.const = parseConst(constMatch[1]);
      continue;
    }
    if (new RegExp(`^ {${fieldIndent}}properties:\\s*$`).test(line)) {
      property.properties = readNestedProperties(block, index + 1, fieldIndent + 2);
    }
  }

  return property;
}

function readNestedProperties(
  block: string[],
  startIndex: number,
  nameIndent: number,
): Record<string, PropertySchema> {
  const properties: Record<string, PropertySchema> = {};
  for (let index = startIndex; index < block.length; index += 1) {
    const line = block[index] ?? '';
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent < nameIndent) break;

    const property = line.match(
      new RegExp(`^ {${nameIndent}}([A-Za-z0-9_]+):\\s*$`),
    );
    if (!property) continue;
    properties[property[1]] = readPropertyFields(block, index + 1, nameIndent + 2);
  }
  return properties;
}

export function readObjectSchema(yaml: string, name: string): ObjectSchema {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `    ${name}:`);
  if (start < 0) throw new Error(`schema ${name} is missing from openapi.yaml`);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^ {4}[A-Za-z0-9]/.test(line)) break;
    block.push(line);
  }
  const required = readSequence(block, 'required', 6) ?? [];
  const properties: Record<string, PropertySchema> = {};
  for (const [index, line] of block.entries()) {
    const property = line.match(/^ {8}([A-Za-z0-9_]+):\s*$/);
    if (!property) continue;
    properties[property[1]] = readPropertyFields(block, index + 1, 10);
  }
  return {
    required,
    properties,
    additionalProperties: block.some((line) =>
      /additionalProperties:\s*true/.test(line),
    ),
  };
}

function primaryType(type: string | string[] | undefined): string | undefined {
  if (type === undefined) return undefined;
  if (typeof type === 'string') return type;
  return type.find((entry) => entry !== 'null');
}

export function schemaViolations(schema: ObjectSchema, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['body must be an object'];
  }
  const body = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of schema.required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      problems.push(`missing ${key}`);
    }
  }
  if (!schema.additionalProperties) {
    for (const key of Object.keys(body)) {
      if (!(key in schema.properties)) problems.push(`unexpected ${key}`);
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in body) || body[key] === undefined) continue;
    const field = body[key];
    if (
      field === null &&
      Array.isArray(property.type) &&
      property.type.includes('null')
    ) {
      continue;
    }
    const type = primaryType(property.type);
    if (type === 'string' && typeof field !== 'string')
      problems.push(`${key} must be a string`);
    if (type === 'number' && typeof field !== 'number')
      problems.push(`${key} must be a number`);
    if (type === 'integer') {
      if (typeof field !== 'number' || !Number.isInteger(field)) {
        problems.push(`${key} must be an integer`);
      }
    }
    if (type === 'boolean' && typeof field !== 'boolean')
      problems.push(`${key} must be a boolean`);
    if (
      type === 'object' &&
      (typeof field !== 'object' || field === null || Array.isArray(field))
    ) {
      problems.push(`${key} must be an object`);
    }
    if (type === 'array' && !Array.isArray(field))
      problems.push(`${key} must be an array`);
    if (
      property.minimum !== undefined &&
      typeof field === 'number' &&
      field < property.minimum
    ) {
      problems.push(`${key} must be >= ${property.minimum}`);
    }
    if (
      property.maximum !== undefined &&
      typeof field === 'number' &&
      field > property.maximum
    ) {
      problems.push(`${key} must be <= ${property.maximum}`);
    }
    if (
      property.maxLength !== undefined &&
      typeof field === 'string' &&
      field.length > property.maxLength
    ) {
      problems.push(`${key} must be <= ${property.maxLength} characters`);
    }
    if (
      property.maxItems !== undefined &&
      Array.isArray(field) &&
      field.length > property.maxItems
    ) {
      problems.push(`${key} must have <= ${property.maxItems} items`);
    }
    if (property.const !== undefined && field !== property.const) {
      problems.push(`${key} must be ${String(property.const)}`);
    }
    if (property.enum && !property.enum.includes(String(field))) {
      problems.push(`${key} must be one of ${property.enum.join(', ')}`);
    }
    if (
      property.format === 'date-time' &&
      (typeof field !== 'string' || Number.isNaN(Date.parse(field)))
    ) {
      problems.push(`${key} must be a date-time`);
    }
  }
  return problems;
}

export function readQuestionDeadlineSeconds(yaml: string): number {
  const match = yaml.match(/whole-question deadline is (\d+) seconds/);
  if (!match) {
    throw new Error('question deadline sentence missing from openapi.yaml');
  }
  return Number(match[1]);
}
