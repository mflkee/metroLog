# Tasks

## 1. Registry setup and recon

- [ ] 1.1 Register the `@shadcn` registry in `frontend/components.json` and verify the shadcn MCP lists items without passing the registry explicitly.
- [ ] 1.2 Search and vet the candidate primitives (dialog, dropdown-menu, select, tooltip, tabs) with the MCP and record the final inventory and the add command; verify the command is reproducible.
- [ ] 1.3 Confirm Tailwind v3 compatibility and record the dependency list the chosen items pull in.

## 2. Install and wire the primitives

- [ ] 2.1 Run the shadcn add command for the chosen items and verify `npm --prefix frontend run build` and `npm --prefix frontend run lint` pass.
- [ ] 2.2 Add the adopted components to `src/components/ui/` and verify only the pilot pages import them.

## 3. Token mapping and theming

- [ ] 3.1 Map the library's CSS variables to the existing design tokens per theme in `src/shared/styles.css` and verify a primitive renders correctly.
- [ ] 3.2 Verify all 10 themes restyle the adopted primitives without a reload and record the check as the thematic acceptance evidence.
- [ ] 3.3 Verify no adopted component hardcodes a color and record the grep result.

## 4. Dialog dismissal contract

- [ ] 4.1 Configure the adopted dialog to not close on outside click and verify by a manual Stage scenario that entered content survives a backdrop click.
- [ ] 4.2 Verify the explicit close control and the Escape key close the dialog, and add a test for this dismissal contract.

## 5. Pilot on the task pages

- [ ] 5.1 Replace the hand-rolled dialog/dropdown/select usage on `TasksPage.tsx` and `TaskDetailsPage.tsx` with the adopted primitives and verify the page builds.
- [ ] 5.2 Verify the pilot flows on Stage (board drag, filters, task card composer, equipment picker) as an operator.

## 6. Audit, docs and integration

- [ ] 6.1 Run the shadcn audit checklist and record which items pass.
- [ ] 6.2 Update `AGENTS.md` (design-system note now records the pilot inventory and the registry) and verify the note matches the shipped inventory.
- [ ] 6.3 Push to `main`, confirm the CI run and Stage deploy succeed, and record the bundle-size delta from the build output.
