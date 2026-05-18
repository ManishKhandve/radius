const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function isInvited(phone) {
  const { data } = await supabase
    .from('pending_invites')
    .select('phone')
    .eq('phone', phone)
    .single();
  return !!data;
}

async function addInvite(phone) {
  await supabase
    .from('pending_invites')
    .upsert({ phone }); // upsert so duplicate sends don't error
}

async function removeInvite(phone) {
  await supabase
    .from('pending_invites')
    .delete()
    .eq('phone', phone);
}

module.exports = { isInvited, addInvite, removeInvite };
