# Tasks

## 1. Filter in the task list query

- [x] 1.1 Add `hidden_folder_ids` to `backend/app/repositories/task_repository.py` (`_apply_filters` and `list_page`): a task in a hidden folder is excluded unless it has no folder or the viewer is its author/participant — verify with a test in `backend/tests/test_tasks.py` where a foreign task in a hidden folder disappears from the list
- [x] 1.2 Keep own tasks visible: verify with tests that the author and the responsible still see the task in a hidden folder (both list branches)
- [x] 1.3 Keep folder-less tasks visible and the per-user nature of the filter: verify with a test that another user who has not hidden the folder still sees the task

## 2. Service wiring and the open-by-id path

- [x] 2.1 Pass the viewer's hidden folders from `backend/app/services/task_service.py` into the repository call, and verify with a test that a viewer without hidden folders gets the unchanged list (no behaviour change by default)
- [x] 2.2 Verify that opening a task of a hidden folder by id still works (access is not removed): cover with a test that `GET /tasks/{id}` returns the task for a viewer who hid its folder

## 3. Interface copy

- [x] 3.1 Update the «Папки» section description in `frontend/src/pages/SettingsPage.tsx` so it names both lists (equipment and tasks) and verify by reading the rendered settings page

## 4. Documentation and Stage check

- [x] 4.1 Record the rule in `AGENTS.md` (tasks: a personally hidden folder hides foreign tasks, own tasks stay)
- [ ] 4.2 On Stage: hide a folder for a test user, verify the foreign task is hidden in «Задачи» and in «Мои задачи», while the user's own task in the same folder stays visible, and the task opens by its link
