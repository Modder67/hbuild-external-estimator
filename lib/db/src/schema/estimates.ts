import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const estimateDraftsTable = pgTable("estimator_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull(),
  slug: text("slug").notNull(),
  version: integer("version").notNull().default(1),
  sourceId: uuid("source_id").notNull(),
  project: jsonb("project").$type<Record<string, unknown>>().notNull(),
  calculation: jsonb("calculation").$type<Record<string, unknown>>().notNull(),
  totals: jsonb("totals").$type<Record<string, number>>().notNull(),
  policyVersion: text("policy_version").notNull(),
  rateBookVersion: text("rate_book_version").notNull(),
  createdBy: uuid("created_by").notNull(),
  updatedBy: uuid("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  orgSourceUnique: uniqueIndex("estimator_drafts_org_source_uq").on(table.orgId, table.sourceId),
}));

export const issuedQuotesTable = pgTable("estimator_issued_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id").notNull().references(() => estimateDraftsTable.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  draftVersion: integer("draft_version").notNull(),
  project: jsonb("project").$type<Record<string, unknown>>().notNull(),
  calculation: jsonb("calculation").$type<Record<string, unknown>>().notNull(),
  totals: jsonb("totals").$type<Record<string, number>>().notNull(),
  policyVersion: text("policy_version").notNull(),
  rateBookVersion: text("rate_book_version").notNull(),
  issuedBy: uuid("issued_by").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  draftRevisionUnique: uniqueIndex("estimator_issued_quotes_draft_revision_uq").on(table.draftId, table.revision),
  draftVersionUnique: uniqueIndex("estimator_issued_quotes_draft_version_uq").on(table.draftId, table.draftVersion),
}));

export const estimateDeliveriesTable = pgTable("estimator_quote_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id").notNull().references(() => issuedQuotesTable.id, { onDelete: "restrict" }).unique(),
  identityJson: jsonb("identity_json").$type<Record<string, unknown>>().notNull(),
  proposalJson: jsonb("proposal_json").$type<Record<string, unknown>>().notNull(),
  takeoffJson: jsonb("takeoff_json").$type<Record<string, unknown>>().notNull(),
  proposalPath: text("proposal_path").notNull(),
  proposalSha256: text("proposal_sha256").notNull(),
  takeoffPath: text("takeoff_path").notNull(),
  takeoffSha256: text("takeoff_sha256").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const estimatorIntakeConnectionsTable = pgTable("estimator_intake_connections", {
  orgId: uuid("org_id").primaryKey(),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  probeClaimedUntil: timestamp("probe_claimed_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EstimateDraftRecord = typeof estimateDraftsTable.$inferSelect;
export type IssuedQuoteRecord = typeof issuedQuotesTable.$inferSelect;
export type EstimateDeliveryRecord = typeof estimateDeliveriesTable.$inferSelect;
export type EstimatorIntakeConnectionRecord = typeof estimatorIntakeConnectionsTable.$inferSelect;