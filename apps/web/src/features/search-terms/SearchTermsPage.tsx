import { PageHeader, SectionCard } from '@adpulse/ui';
import Alert from '@mui/material/Alert';
import { FilterBar } from '@/components/FilterBar';
import { RequirePermission } from '@/components/RequirePermission';
import { useMetricFilters } from '@/hooks/useMetricFilters';
import { SearchTermsTable } from './SearchTermsTable';

function SearchTermsContent() {
  const { filters, setFilters, resetFilters, apiParams, activeCount } = useMetricFilters();
  return (
    <>
      <PageHeader
        title="Search terms"
        description="Queries that triggered your ads, with cost-efficiency flags for manual review."
      />
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Flags are suggestions based on observed spend and conversions in the selected period. ADPULSE does not
        add negative keywords automatically — review each term and apply changes yourself in Google Ads.
      </Alert>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        activeCount={activeCount}
        controls={['account', 'campaigns', 'device', 'location']}
      />
      <SectionCard flush>
        <SearchTermsTable baseParams={{ ...apiParams, compare: false }} />
      </SectionCard>
    </>
  );
}

export function SearchTermsPage() {
  return (
    <RequirePermission permission="analytics:read">
      <SearchTermsContent />
    </RequirePermission>
  );
}
