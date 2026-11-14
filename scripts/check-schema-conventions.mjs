#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, visit } from 'graphql';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(
  process.argv[2] ?? join(root, 'packages/contracts/schema.graphql'),
);
const ceilingPath = join(root, 'scripts/schema-conventions-ceiling.json');
const CLOSED = new Set(['status', 'kind', 'role', 'visibility']);

function namedType(typeNode) {
  let t = typeNode;
  while (t.kind === 'NonNullType' || t.kind === 'ListType') t = t.type;
  return t.name.value;
}

function isInputObject(ancestors) {
  return [...ancestors].reverse().some(
    (a) =>
      a &&
      (a.kind === 'InputObjectTypeDefinition' ||
        a.kind === 'InputObjectTypeExtension'),
  );
}

const counts = {
  stringClosedSetFields: 0,
  nonListResultPagedFields: 0,
};

visit(parse(readFileSync(schemaPath, 'utf8')), {
  FieldDefinition(node) {
    if (CLOSED.has(node.name.value) && namedType(node.type) === 'String') {
      counts.stringClosedSetFields += 1;
    }
    const args = new Set((node.arguments ?? []).map((a) => a.name.value));
    if (
      args.has('limit') &&
      args.has('offset') &&
      !namedType(node.type).endsWith('ListResult')
    ) {
      counts.nonListResultPagedFields += 1;
    }
  },
  InputValueDefinition(node, _key, _parent, _path, ancestors) {
    if (!isInputObject(ancestors)) return;
    if (CLOSED.has(node.name.value) && namedType(node.type) === 'String') {
      counts.stringClosedSetFields += 1;
    }
  },
});

const ceiling = JSON.parse(readFileSync(ceilingPath, 'utf8'));
let failed = false;
for (const key of Object.keys(counts)) {
  const actual = counts[key];
  const max = ceiling[key];
  if (typeof max !== 'number') {
    console.error(`check-schema-conventions: missing ceiling for ${key}`);
    failed = true;
    continue;
  }
  if (actual > max) {
    console.error(
      `check-schema-conventions FAILED — ${key} is ${actual} (ceiling ${max})`,
    );
    failed = true;
  } else if (actual < max) {
    console.log(
      `check-schema-conventions: ${key} is ${actual} (ceiling ${max}; may lower)`,
    );
  }
}

if (failed) process.exit(1);
console.log(
  `check-schema-conventions OK — stringClosedSetFields=${counts.stringClosedSetFields} nonListResultPagedFields=${counts.nonListResultPagedFields}`,
);
