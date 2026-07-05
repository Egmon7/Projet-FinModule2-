/**
 * Comptes de test masqués dans Egmon-Chat.
 * L'API Kadea ne propose pas DELETE /users — ils restent sur le serveur
 * mais n'apparaissent plus dans la liste des contacts.
 */

const BLOCKED_USER_IDS = new Set([
  "ee5e8735-fdaf-4a1f-97d5-fb7a155bb555",
  "edeaae9d-7990-477e-b9cf-dcda019dffd5",
  "dd4734c4-839d-44ff-acb6-cac84a9e6fc7",
  "d3a1efa0-c92c-42aa-b77e-18dbf49a4601",
  "f9afe561-5e6d-48c7-a733-3879e9446991",
  "34bb5da1-8ef5-4f7f-8688-19006f725b69",
  "0efb6d9b-51ec-403a-8b87-3ac4aa722f18",
  "d03d93cf-156c-4f2c-8667-6e88d4cda2f0",
  "d8bceb0e-295e-4bbc-9eb6-eacad59179bf",
  "f3920654-8873-47e1-b30e-76a59d8a424b",
]);

const BLOCKED_USER_EMAILS = new Set([
  "user1782989010239@test.com",
  "user1782988971442@test.com",
  "user1782988997335@test.com",
  "user@test.com",
  "user@test1.com",
  "user@test2.com",
  "user1782979272947@test.com",
  "user1782979280680@test.com",
  "user1782979272315@test.com",
  "user1782982368887@test.com",
]);

function isBlockedUser(user) {
  if (!user) return true;
  if (BLOCKED_USER_IDS.has(user.id)) return true;
  if (user.email && BLOCKED_USER_EMAILS.has(user.email.toLowerCase())) return true;
  return false;
}
