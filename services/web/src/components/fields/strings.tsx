"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { FieldStrings } from "./types";

/**
 * Builds the {@link FieldStrings} bundle (chrome labels + validation
 * messages) from the `fields` i18n namespace. `AutoForm` calls this so
 * callers get fully-localized fields for free ; standalone users of a
 * single field input can call it too, or pass their own strings.
 */
export function useFieldStrings(): FieldStrings {
  const t = useTranslations("fields");

  return useMemo<FieldStrings>(
    () => ({
      labels: {
        noResults: t("noResults"),
        searchPlaceholder: t("searchPlaceholder"),
        createOption: (value) => t("createOption", { value }),
        clear: t("clear"),
        pickDate: t("pickDate"),
        charCount: (count, max) => t("charCount", { count, max }),
        selectPlaceholder: t("selectPlaceholder"),
        add: t("add"),
        loading: t("loading"),
        remove: (label) => t("remove", { label }),
        yes: t("yes"),
        no: t("no"),
        empty: t("empty"),
        more: (count) => t("more", { count }),
        richText: {
          bold: t("richText.bold"),
          italic: t("richText.italic"),
          strike: t("richText.strike"),
          code: t("richText.code"),
          heading1: t("richText.heading1"),
          heading2: t("richText.heading2"),
          heading3: t("richText.heading3"),
          heading4: t("richText.heading4"),
          paragraph: t("richText.paragraph"),
          textStyle: t("richText.textStyle"),
          bulletList: t("richText.bulletList"),
          orderedList: t("richText.orderedList"),
          blockquote: t("richText.blockquote"),
          link: t("richText.link"),
          unlink: t("richText.unlink"),
          linkUrlPlaceholder: t("richText.linkUrlPlaceholder"),
          linkApply: t("richText.linkApply"),
        },
      },
      messages: {
        required: t("required"),
        invalidUrl: t("invalidUrl"),
        invalidEmail: t("invalidEmail"),
        tooShort: (min) => t("tooShort", { min }),
        tooLong: (max) => t("tooLong", { max }),
        tooSmall: (min) => t("tooSmall", { min }),
        tooLarge: (max) => t("tooLarge", { max }),
        notInteger: t("notInteger"),
        tooManyItems: (max) => t("tooManyItems", { max }),
      },
    }),
    [t],
  );
}
