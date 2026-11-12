# Portfolio Manager — first stage

## What is ready

Open http://127.0.0.1:4173/manager.html while the local preview server is running.
The manager imports the eight existing portfolio images into the six existing categories.
It supports local photo additions (JPG, PNG, WebP, up to 12 MB each), descriptions,
gallery assignment, earlier/later ordering, removal from the draft, and layout selection.
Save Draft commits a complete snapshot to IndexedDB and confirms only after the
transaction succeeds. Reload restores that snapshot. Draft preview uses the original
portfolio HTML and CSS, replacing only its gallery contents inside an iframe.
Preview images use their natural proportions without hover enlargement or cropping.

This is a local editor, not an authenticated online admin application.
No credentials, backend, cloud backups, live publishing, or fake login are included.
Publish is disabled with its reason displayed. Drafts belong to the browser and origin;
clearing browser data, changing ports, or using another browser will not restore them.
Keep original files. Uploaded photos never leave the computer through this editor.
Reordering uses accessible buttons; drag and drop is deferred.
Removal has an Undo removal button for the current editing session.

## Existing architecture inspected

Repository: mjdesigns90/Melissa-j-photography, main branch.
GitHub Pages serves plain HTML, CSS and JavaScript. No package manager, build system,
server, authentication service, database or upload API exists in the inspected tree.
Homepage, original portfolio, all original image files and links are preserved.
The original portfolio uses a twelve-column grid with wide, tall and full-width figures.

## Proposed online architecture (not provisioned)

Keep the public website on GitHub Pages. Host the manager and its API separately.
Use Supabase Auth for invite-only owner sign-in, with public registration disabled,
an explicit owner UUID allowlist and MFA required for publishing. Use the official
session verification API on the server for every protected request; never trust
an email address, browser flag or hidden admin link as authorization.
Store sessions in secure HttpOnly cookies through a small backend; protect writes
against CSRF and apply rate limits. No service-role key or GitHub token in browser code.

Supabase Postgres stores galleries and draft versions; row-level policies deny
anonymous access and restrict every draft row to the authorized owner. Suggested model:

- galleries: stable ID, slug, heading, description, position
- assets: UUID, private object key, original name, MIME, bytes, width, height, checksum
- draft_versions: UUID, owner ID, revision, metadata JSON, saved timestamp
- releases: immutable version ID, draft revision, manifest path, state, timestamps
- release_items: release ID, asset ID, gallery ID, description, position, layout
- publish_jobs: idempotency key, owner, requested revision, state, error, audit timestamps

Store original uploads in a private Supabase Storage bucket with owner-only policies.
Validate file signatures and decoded dimensions server-side, limit size/pixel count,
normalize EXIF orientation, strip GPS metadata from public derivatives, and generate
web-sized versions without cropping. Retain originals privately. Store intended display
layout separately from intrinsic image dimensions. Use expiring signed URLs for drafts.
Only approved web derivatives enter a separate public release bucket.

Save Draft updates a private version with optimistic revision checks, so simultaneous
tabs cannot silently overwrite one another. Publish presents a review of additions,
removals and order changes, then calls an authorized server job for that exact revision.
The job creates immutable public derivatives and a versioned manifest first, validates
all references and builds the existing portfolio markup in staging. A narrowly scoped
GitHub App changes only the generated portfolio artifact on an approved release branch;
the owner approves the production merge/deployment. Check deployment completion before
reporting success. Preserve the last good release and offer rollback. Failed jobs must
leave the previous public portfolio active. Drafts must never enter GitHub Pages artifacts.

This approach preserves the public design while keeping private editing behind real
server authorization. A server-capable host and Supabase project still need setup.
No accounts, subscriptions, secrets or online services have been created.

Primary references reviewed November 11, 2026:

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Storage access control and row-level policies](https://supabase.com/docs/guides/storage/security/access-control)

## Navigation incident

The live homepage showed a raw bulleted menu. Downloading the live unversioned
style.css returned 12,755 bytes and no site-nav rules; GitHub main contained 14,717 bytes
with those rules. Fetching the stylesheet with a fresh query returned the correct rules.
This supports a stale cached asset as the cause. The repair versions the CSS and JS
URLs in index.html; it does not redesign the page. The owner separately authorized
publishing this menu repair. Manager files stay on a separate review branch and are not deployed.
Repair commit: c5aa511e5ed71c57805adb3e10c269f28f87ffa7. The live homepage was then
verified to load style.css?v=nav-20261111 and show the correct teal navigation.

## Validation performed

- Browser: original eight photos and all six categories imported successfully.
- Reordered senior photographs and edited a description; saved and reloaded to
  confirm persistent order and description.
- Added a real repository JPG through the file picker; saved and reloaded to confirm
  its embedded photo data persisted.
- Removed that test addition, used Undo removal successfully, then removed it again.
  Restored the original description/order and saved a clean eight-photo draft.
- Preview loaded all eight original photographs. Computed image styles showed contain,
  automatic aspect ratio and no transform for every preview photograph.
- Checked phone-width homepage and manager in 390px iframes. Mobile menu expanded on
  activation and collapsed with Escape. No horizontal overflow was visible.
- Original portfolio HTML/CSS, homepage CSS/JS and every original image match the
  downloaded repository files byte for byte. Only homepage asset version URLs changed.

No end-to-end cloud authentication or publishing tests are claimed: those services
are proposed, not implemented. Browser storage quota failures are handled with an
error message, but quota exhaustion was not forced during this test.

## Running the preview again

From this folder on this Mac:

    ruby -rwebrick -e 's=WEBrick::HTTPServer.new(Port:4173,BindAddress:"127.0.0.1",DocumentRoot:Dir.pwd);trap("INT"){s.shutdown};s.start'

Then open the local URL above. No deployment command is provided.
