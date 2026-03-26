/**
 * Shared test fixtures for MCP auto-discovery tests.
 */

import type { PluginInfo } from "../client.js";

export const REPRESENTATIVE_PLUGINS: PluginInfo[] = [
  {
    name: "metadata",
    type: "extension",
    version: "1.0.0",
    description: "Entry title and summary",
    depends_on: [],
    provider: {
      fields: ["summary", "title"],
      writable_fields: ["summary", "title"],
      required_on_create: ["title"],
      include_in_list: true,
      include_in_detail: true,
    },
  },
  {
    name: "tags",
    type: "extension",
    version: "1.0.0",
    description: "User-authored entry classifications",
    depends_on: [],
    provider: {
      fields: ["tags"],
      writable_fields: ["tags"],
      required_on_create: [],
      include_in_list: true,
      include_in_detail: true,
    },
  },
  {
    name: "types",
    type: "extension",
    version: "1.0.0",
    description: "Entry type classification",
    depends_on: [],
    provider: {
      fields: ["entry_type"],
      writable_fields: ["entry_type"],
      required_on_create: [],
      include_in_list: true,
      include_in_detail: true,
    },
  },
];

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
          { name: "include", in: "query", required: false, schema: { anyOf: [{ type: "string" }, { type: "null" }] } },
          { name: "exclude", in: "query", required: false, schema: { anyOf: [{ type: "string" }, { type: "null" }] } },
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
                properties: {
                  content: { anyOf: [{ type: "string" }, { type: "null" }] },
                  content_format: { type: "string", default: "markdown" },
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
        description: "Retrieve a single entry by ID with auto-composed extension data.",
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "include", in: "query", required: false, schema: { anyOf: [{ type: "string" }, { type: "null" }] } },
          { name: "exclude", in: "query", required: false, schema: { anyOf: [{ type: "string" }, { type: "null" }] } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
      patch: {
        operationId: "update_entry_v1_entries__entry_id__patch",
        summary: "Update Entry",
        description: "Update entry via unified PATCH — routes fields to owning extensions.",
        security: [{ Bearer: [] }],
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties: {} },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/entities/{entity_id}": {
      get: {
        operationId: "resolve_entity_v1_entities__entity_id__get",
        summary: "Resolve Entity",
        description: "Resolve any UUID to its entity type and composed data.",
        parameters: [
          { name: "entity_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
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
    "/v1/extensions/metadata/{entry_id}": {
      put: {
        operationId: "set_metadata_v1_extensions_metadata__entry_id__put",
        summary: "Set Metadata",
        description: "Set title and summary on an entry.",
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
                required: ["title"],
                properties: {
                  title: { type: "string", maxLength: 500 },
                  summary: { anyOf: [{ type: "string", maxLength: 2000 }, { type: "null" }] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/extensions/types/{entry_id}": {
      put: {
        operationId: "set_type_v1_extensions_types__entry_id__put",
        summary: "Set Type",
        description: "Set the entry type.",
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
                required: ["entry_type"],
                properties: { entry_type: { type: "string", maxLength: 100 } },
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
        properties: {
          content: { anyOf: [{ type: "string" }, { type: "null" }] },
          content_format: { type: "string", default: "markdown" },
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
