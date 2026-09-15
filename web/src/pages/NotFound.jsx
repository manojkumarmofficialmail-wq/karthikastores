import { Link } from 'react-router-dom';
import { PageBar } from '../components/TopBar.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

export const NotFoundPage = () => (
  <>
    <PageBar title="Not found" />
    <main className="page">
      <EmptyState
        art="🧭"
        title="This shelf is empty"
        message="The page you were looking for does not exist."
        action={
          <Link to="/" className="btn btn--primary">
            Back to the shop
          </Link>
        }
      />
    </main>
  </>
);
