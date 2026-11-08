/**
 * src/modules/campaigns/campaigns.service.js
 * ─────────────────────────────────────────────
 * Data-access layer for all campaign operations.
 * Contains ONLY Prisma queries — no HTTP req/res logic.
 *
 * Imported by: campaigns.controller.js
 */

'use strict';

const prisma = require('@/config/db');

const VALID_OPERATORS  = ['GREATER_THAN','LESS_THAN','EQUALS','GREATER_THAN_OR_EQUAL','LESS_THAN_OR_EQUAL','NOT_EQUALS'];
const VALID_RULE_TYPES = ['MIN_DEPOSIT', 'ACCOUNT_TYPE'];

// ── Create campaign ───────────────────────────────────────────────────────────
async function createCampaign({ name, campaign_code, description, start_date, end_date, reward_type, reward_value, reward_threshold }) {
  return prisma.campaign.create({
    data: {
      name,
      campaign_code:    campaign_code ?? null,
      description:      description ?? null,
      start_date:       new Date(start_date),
      end_date:         new Date(end_date),
      reward_type,
      reward_value,
      reward_threshold: reward_threshold ?? null,
      is_active:        true,
      status:           'DRAFT',
    },
  });
}

// ── Add a rule to a campaign ──────────────────────────────────────────────────
async function findCampaignById(id) {
  return prisma.campaign.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
}

async function addRule(campaignId, { rule_type, operator, rule_value }) {
  return prisma.campaignRule.create({
    data: { campaign_id: campaignId, rule_type, operator, rule_value },
  });
}

// ── Delete a rule ─────────────────────────────────────────────────────────────
async function deleteRule(campaignId, ruleId) {
  return prisma.campaignRule.deleteMany({
    where: { id: ruleId, campaign_id: campaignId },
  });
}

// ── Activate campaign (DRAFT → ACTIVE) ───────────────────────────────────────
async function activateCampaign(campaignId) {
  return prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'ACTIVE' },
  });
}

// ── Update campaign fields ────────────────────────────────────────────────────
async function findCampaignForUpdate(id) {
  return prisma.campaign.findUnique({
    where:  { id },
    select: { name: true, start_date: true, end_date: true, reward_value: true, description: true, reward_threshold: true },
  });
}

async function updateCampaign(campaignId, data) {
  return prisma.campaign.update({ where: { id: campaignId }, data });
}

// ── Delete campaign (with referral guard + transaction) ───────────────────────
async function countReferralsByCampaign(campaignId) {
  return prisma.referral.count({ where: { campaign_id: campaignId } });
}

async function deleteCampaignWithRules(campaignId) {
  return prisma.$transaction([
    prisma.campaignRule.deleteMany({ where: { campaign_id: campaignId } }),
    prisma.campaign.delete({ where: { id: campaignId } }),
  ]);
}

// ── List campaigns (paginated) ────────────────────────────────────────────────
async function listCampaigns(page, limit) {
  const skip = (page - 1) * limit;
  return prisma.$transaction([
    prisma.campaign.count(),
    prisma.campaign.findMany({
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: { rules: true },
    }),
  ]);
}

// ── Campaign stats ────────────────────────────────────────────────────────────
async function countReferrals(campaignId) {
  return prisma.referral.count({ where: { campaign_id: campaignId } });
}

module.exports = {
  VALID_OPERATORS,
  VALID_RULE_TYPES,
  createCampaign,
  findCampaignById,
  addRule,
  deleteRule,
  activateCampaign,
  findCampaignForUpdate,
  updateCampaign,
  countReferralsByCampaign,
  deleteCampaignWithRules,
  listCampaigns,
  countReferrals,
};

