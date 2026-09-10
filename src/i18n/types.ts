/* The shape a dictionary entry may take.

   A plain string is the common case. The map form is for wording that a count
   decides: English needs two forms, Ukrainian four, and which categories a
   locale actually uses is Intl.PluralRules' business rather than something the
   dictionaries should have to agree on. Every plural entry carries `other`,
   which is the fallback when a locale asks for a category this entry has no
   line for. */

export type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

export type Phrase = string | Plural;

/** Values substituted into `{name}` placeholders. `count` is also what selects
 *  the plural form, so it is always a number. */
export type Params = Record<string, string | number>;
