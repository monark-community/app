import { z } from "zod";
import type { FieldDef, FieldMessages } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rough tag strip for validating that rich-text isn't visually empty. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Builds the zod fragment that validates one field's form value. */
export function schemaFor(def: FieldDef, m: FieldMessages): z.ZodTypeAny {
  switch (def.type) {
    case "text":
    case "longText": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong(def.maxLength));
      if (def.required) {
        const min = def.minLength && def.minLength > 1 ? def.minLength : 1;
        return s.min(min, min > 1 ? m.tooShort(min) : m.required);
      }
      if (def.minLength != null) {
        const min = def.minLength;
        return s.refine((v) => v.length === 0 || v.length >= min, m.tooShort(min));
      }
      return s;
    }

    case "richText": {
      const s = z.string();
      return def.required ? s.refine((v) => stripTags(v).trim().length > 0, m.required) : s;
    }

    case "url": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong(def.maxLength));
      const withUrl = s.refine((v) => v === "" || isHttpUrl(v), m.invalidUrl);
      return def.required
        ? s.min(1, m.required).refine((v) => isHttpUrl(v), m.invalidUrl)
        : withUrl;
    }

    case "email": {
      let s = z.string();
      if (def.maxLength != null) s = s.max(def.maxLength, m.tooLong(def.maxLength));
      const withEmail = s.refine((v) => v === "" || EMAIL_RE.test(v), m.invalidEmail);
      return def.required
        ? s.min(1, m.required).refine((v) => EMAIL_RE.test(v), m.invalidEmail)
        : withEmail;
    }

    case "number": {
      let n = z.number({ invalid_type_error: m.required });
      if (def.integer) n = n.int(m.notInteger);
      if (def.min != null) n = n.min(def.min, m.tooSmall(def.min));
      if (def.max != null) n = n.max(def.max, m.tooLarge(def.max));
      return def.required ? n : n.nullable();
    }

    case "boolean":
      return z.boolean();

    case "date":
    case "datetime":
      return def.required ? z.date({ invalid_type_error: m.required }) : z.date().nullable();

    case "singleSelect":
      return def.required
        ? z.string({ invalid_type_error: m.required }).min(1, m.required)
        : z.string().nullable();

    case "multiSelect": {
      let a = z.array(z.string());
      if (def.max != null) a = a.max(def.max, m.tooManyItems(def.max));
      return def.required ? a.min(1, m.required) : a;
    }

    case "relation": {
      if (def.multiple) {
        let a = z.array(z.string());
        if (def.max != null) a = a.max(def.max, m.tooManyItems(def.max));
        return def.required ? a.min(1, m.required) : a;
      }
      return def.required
        ? z.string({ invalid_type_error: m.required }).min(1, m.required)
        : z.string().nullable();
    }
  }
}

/** Assembles the object schema for a whole form from its field defs. */
export function schemaForFields(
  fields: FieldDef[],
  messages: FieldMessages,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(Object.fromEntries(fields.map((def) => [def.name, schemaFor(def, messages)])));
}
