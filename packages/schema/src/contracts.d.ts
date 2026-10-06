declare module '../../contracts/effect-stack.schema.json' {
  const schema: {
    $schema: string;
    $id: string;
    title: string;
    type: 'array';
    items: unknown;
    minItems: number;
  };
  export default schema;
}

declare module '../../contracts/preset.schema.json' {
  const schema: {
    $schema: string;
    $id: string;
    title: string;
    type: 'object';
    required: string[];
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
  export default schema;
}

declare module '../../contracts/document.schema.json' {
  const schema: {
    $schema: string;
    $id: string;
    title: string;
    type: 'object';
    required: string[];
    properties: Record<string, unknown>;
    additionalProperties: boolean;
    $defs: Record<string, unknown>;
  };
  export default schema;
}
