# Sales Follow-up Flow — Setup Guide

Implements the lead rules end-to-end:

| # | Rule | How it works |
|---|------|--------------|
| 1 | IF new lead → Start New Lead Sequence | `New Lead Sequence` template (Record Created trigger) |
| 2 | IF customer replies → STOP automatic messages | Engine cancels the contact's tasks in every workflow with **Stop on reply = Yes** |
| 3 | IF salesperson marks **Connected** → STOP New Lead Sequence | `Stop on Connected` template (Status Changed trigger, stops group `new-lead`) |
| 4 | IF salesperson marks **Proposal Sent** → START Proposal Follow-up | `Proposal Follow-up Sequence` template (also stops `new-lead`) |
| 5 | IF customer says “I’ll think” → START Thinking Sequence | `Interested / Thinking Sequence` template (Keyword trigger) |
| 6 | IF customer says “price is high” → START Price Objection | `Price Objection Sequence` template (Keyword trigger) |
| 7 | IF payment received → STOP ALL sales → START Onboarding | `Website Onboarding Sequence` template (Status Changed → `Payment Received`, stops `*`) |
| 8 | IF salesperson manually pauses → STOP ALL automatic messages | **⚡ Auto** button in the chat header (inbox) |

## 1. Create the WhatsApp templates (Meta, once)

The starter workflows reference these placeholder template names. Create
matching **Meta-approved** templates (or edit each Send node to use your own
names — the builder validates the name format, Meta enforces approval):

- `new_lead_touch_1`, `new_lead_touch_2`, `new_lead_touch_3`
- `proposal_touch_1`, `proposal_touch_2`
- `thinking_touch_1`, `thinking_touch_2`
- `price_touch_1`, `price_touch_2`
- `onboarding_welcome`, `onboarding_step_2`

Tip: keep `{{1}}` as the contact's name (all starter nodes send the name).

## 2. Install the workflows (Automation page)

1. Open **Automation → 📋 New from Template**.
2. Add, in this order: **New Lead Sequence**, **Stop on Connected**,
   **Proposal Follow-up Sequence**, **Interested / Thinking Sequence**,
   **Price Objection Sequence**, **Website Onboarding Sequence**.
3. Adjust texts/delays/keywords per node as needed.
4. Press **🚀 Publish** on each (validation runs first).

Only **published (active)** workflows fire.

## 3. Statuses must match (case-insensitive)

The salesperson sets these from the inbox profile panel (or anywhere
`lead_status` is written — the trigger fires on the *change* itself):

- `Connected` → stops New Lead
- `Proposal Sent` → starts Proposal Follow-up
- `Payment Received` → stops everything sales, starts Onboarding

## 4. Optional SQL — pause survives restarts

Manual pauses work immediately without this, but are forgotten on server
restart. Run once on your Neon database to persist them (the column ships in `neon-schema.sql`):

```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS automation_paused boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_contacts_automation_paused ON contacts (automation_paused);
```

## 5. Behaviour notes

- **Reply-stop is per workflow.** Workflow Settings → *Stop when the
  customer replies* (default Yes). The `Stop on Connected` utility has it
  off (it sends nothing anyway).
- **Groups** (Workflow Settings → Group label) are what status triggers
  cancel: `new-lead`, `proposal`, `thinking`, `objection`, `onboarding`.
  `*` in a status trigger means “every other workflow”.
- **Manual Run Now ignores the pause** (explicit human action). Keyword /
  status / schedule triggers respect it.
- **Status loops:** `action_update_status` also fires status triggers. Don't
  build A→B→A status cycles or contacts will bounce between workflows.
- **New-lead detection** uses `contacts.created_at`. If your contacts table
  lacks it, add `created_at timestamptz DEFAULT now()`.
- **First message:** the lightweight bot (`WELCOME_MESSAGE`) still greets
  first-time writers. If that double-messages with the New Lead Sequence,
  set `WELCOME_MESSAGE=""` — the sequence owns the first touch.
