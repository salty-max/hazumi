import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

const hazumiHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "oklch(0.64 0.035 255)",
    fontStyle: "italic",
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
    ],
    color: "oklch(0.78 0.15 340)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "oklch(0.82 0.12 155)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "oklch(0.84 0.13 80)",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "oklch(0.8 0.11 225)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "oklch(0.79 0.08 250)",
  },
  {
    tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)],
    color: "oklch(0.8 0.09 230)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName],
    color: "oklch(0.8 0.12 305)",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    color: "oklch(0.7 0.025 255)",
  },
  {
    tag: [tags.regexp, tags.escape],
    color: "oklch(0.8 0.13 35)",
  },
  {
    tag: tags.invalid,
    color: "oklch(0.82 0.16 25)",
    textDecoration: "underline wavy",
  },
]);

export const hazumiSyntaxHighlighting: Extension = syntaxHighlighting(hazumiHighlightStyle);
