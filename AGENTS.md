<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Payment status changes only through security-definer RPCs (`create_registration`, `submit_payment`) or admin RLS updates; students have no direct insert/update — prevents self-approval.
- Admin access is the `admin` row in `public.user_roles` checked via `has_role`; never derive from user metadata.
- Payment screenshots live in the private `payment-screenshots` bucket under `<user_id>/`; admins view via short-lived signed URLs.
- Homepage scroll scenes use `motion` `useScroll` on sticky tall sections (2.5D parallax), not a 3D engine — keeps mobile smooth.
- Trip constants and the UPI link builder live in `src/lib/trip.ts` (covered by `trip.test.ts`).
