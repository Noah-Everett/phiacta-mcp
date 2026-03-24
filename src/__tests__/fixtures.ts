/**
 * Shared test fixtures for MCP auto-discovery tests.
 */

export const REPRESENTATIVE_OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/entries": {
      get: {
        operationId: "list_entries_v1_entries_get",
        summary: "List Entries",
        description: "Retrieve a paginated list of entries.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
          { name: "status", in: "query", required: false, schema: { type: "string", default: "active" } },
          { name: "layout_hint", in: "query", required: false, schema: { anyOf: [{ type: "string" }, { type: "null" }] } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
      post: {
        operationId: "create_entry_v1_entries_post",
        summary: "Create Entry",
        description: "Create a new entry in the knowledge base.",
        security: [{ Bearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  summary: { anyOf: [{ type: "string" }, { type: "null" }] },
                  layout_hint: { type: "string", default: "assertion" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/entries/{entry_id}": {
      get: {
        operationId: "get_entry_v1_entries__entry_id__get",
        summary: "Get Entry",
        description: "Retrieve a single entry by ID.",
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/extensions/tags/": {
      get: {
        operationId: "list_tags_for_entry_v1_extensions_tags__get",
        summary: "List Tags For Entry",
        parameters: [
          { name: "entry_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/extensions/tags/{entry_id}": {
      put: {
        operationId: "set_tags_v1_extensions_tags__entry_id__put",
        summary: "Set Tags",
        description: "Replace all tags on an entry.",
        security: [{ Bearer: [] }],
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tags"],
                properties: { tags: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/tools/search/": {
      get: {
        operationId: "search_entries_v1_tools_search__get",
        summary: "Search Entries",
        description: "Full-text search over entries.",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/auth/login": {
      post: {
        operationId: "login_v1_auth_login_post",
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["handle", "password"],
                properties: { handle: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/health": {
      get: {
        operationId: "health_health_get",
        summary: "Health",
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

export const EMPTY_OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {},
};

export const AUTH_ONLY_OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/auth/login": {
      post: {
        operationId: "login_v1_auth_login_post",
        summary: "Login",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["handle", "password"], properties: { handle: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/auth/register": {
      post: {
        operationId: "register_v1_auth_register_post",
        summary: "Register",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["handle", "password"], properties: { handle: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/health": {
      get: { operationId: "health_health_get", summary: "Health", responses: { "200": { description: "Successful Response" } } },
    },
  },
};

export const SPEC_WITH_UNCONVERTIBLE_SCHEMA = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/entries": {
      get: {
        operationId: "list_entries_v1_entries_get",
        summary: "List Entries",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } }],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/broken": {
      post: {
        operationId: "broken_endpoint_v1_broken_post",
        summary: "Broken Endpoint",
        security: [{ Bearer: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "INVALID_TYPE_THAT_DOES_NOT_EXIST" as any } } } },
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

export const SPEC_WITH_MISSING_OPERATION_ID = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/entries": {
      get: {
        summary: "List Entries",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } }],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/entries/{entry_id}": {
      get: {
        operationId: "get_entry_v1_entries__entry_id__get",
        summary: "Get Entry",
        parameters: [{ name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

export const SPEC_WITH_PARAM_COLLISION = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/things/{name}": {
      put: {
        operationId: "update_thing_v1_things__name__put",
        summary: "Update Thing",
        security: [{ Bearer: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "integer" } } } } } },
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

/**
 * OpenAPI spec with $ref references — mirrors real FastAPI output where
 * request body schemas reference components/schemas.
 */
export const SPEC_WITH_REFS = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  components: {
    schemas: {
      EntryCreate: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" },
          summary: { anyOf: [{ type: "string" }, { type: "null" }] },
          layout_hint: { type: "string", default: "assertion" },
        },
      },
      SetTagsRequest: {
        type: "object",
        required: ["tags"],
        properties: {
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  paths: {
    "/v1/entries": {
      post: {
        operationId: "create_entry_v1_entries_post",
        summary: "Create Entry",
        security: [{ HTTPBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EntryCreate" },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/extensions/tags/{entry_id}": {
      put: {
        operationId: "set_tags_v1_extensions_tags__entry_id__put",
        summary: "Set Tags",
        security: [{ HTTPBearer: [] }],
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SetTagsRequest" },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

export const SPEC_WITH_DELETE = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/entries/{entry_id}": {
      delete: {
        operationId: "delete_entry_v1_entries__entry_id__delete",
        summary: "Delete Entry",
        security: [{ Bearer: [] }],
        parameters: [{ name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Successful Response" } },
      },
      get: {
        operationId: "get_entry_v1_entries__entry_id__get",
        summary: "Get Entry",
        parameters: [{ name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};
