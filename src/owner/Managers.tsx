import { MigrationPending } from './MigrationPending';

/** Managers CRUD is localStorage-backed. Live owner path shows migration pending. */
export function ManagersPage() {
  return (
    <MigrationPending
      title="Менеджеры"
      detail="CRUD менеджеров сейчас опирается на localStorage. Будет переведено на защищённое ядро."
    />
  );
}
