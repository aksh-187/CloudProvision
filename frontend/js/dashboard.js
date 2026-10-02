/**
 * CloudProvision — Dashboard page script (stub)
 *
 * Full implementation in Phase 7.
 * This stub bootstraps the page auth guard and wires the logout button.
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Will redirect to /login.html if not authenticated (Phase 3+)
  // let user;
  // try { user = await requireAuth(); } catch { return; }
  // populateSidebarUser(user);

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  }
});
