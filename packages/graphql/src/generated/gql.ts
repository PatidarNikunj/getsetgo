/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "fragment NoteFields on Note {\n  id\n  title\n  content\n  createdAt\n  summary {\n    summary\n    keyPoints\n    model\n    createdAt\n  }\n}\n\nquery NotesList($page: NotesPageInput) {\n  notesList(page: $page) {\n    ...NoteFields\n  }\n}\n\nmutation CreateNote($input: CreateNoteInput!) {\n  createNote(input: $input) {\n    ...NoteFields\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}\n\nmutation SummarizeNote($id: ID!) {\n  summarizeNote(id: $id) {\n    ...NoteFields\n  }\n}": typeof types.NoteFieldsFragmentDoc,
};
const documents: Documents = {
    "fragment NoteFields on Note {\n  id\n  title\n  content\n  createdAt\n  summary {\n    summary\n    keyPoints\n    model\n    createdAt\n  }\n}\n\nquery NotesList($page: NotesPageInput) {\n  notesList(page: $page) {\n    ...NoteFields\n  }\n}\n\nmutation CreateNote($input: CreateNoteInput!) {\n  createNote(input: $input) {\n    ...NoteFields\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}\n\nmutation SummarizeNote($id: ID!) {\n  summarizeNote(id: $id) {\n    ...NoteFields\n  }\n}": types.NoteFieldsFragmentDoc,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment NoteFields on Note {\n  id\n  title\n  content\n  createdAt\n  summary {\n    summary\n    keyPoints\n    model\n    createdAt\n  }\n}\n\nquery NotesList($page: NotesPageInput) {\n  notesList(page: $page) {\n    ...NoteFields\n  }\n}\n\nmutation CreateNote($input: CreateNoteInput!) {\n  createNote(input: $input) {\n    ...NoteFields\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}\n\nmutation SummarizeNote($id: ID!) {\n  summarizeNote(id: $id) {\n    ...NoteFields\n  }\n}"): (typeof documents)["fragment NoteFields on Note {\n  id\n  title\n  content\n  createdAt\n  summary {\n    summary\n    keyPoints\n    model\n    createdAt\n  }\n}\n\nquery NotesList($page: NotesPageInput) {\n  notesList(page: $page) {\n    ...NoteFields\n  }\n}\n\nmutation CreateNote($input: CreateNoteInput!) {\n  createNote(input: $input) {\n    ...NoteFields\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}\n\nmutation SummarizeNote($id: ID!) {\n  summarizeNote(id: $id) {\n    ...NoteFields\n  }\n}"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;