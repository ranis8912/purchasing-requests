import { Link } from "react-router";
import { Compass } from "lucide-react";
import { Empty } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page">
      <div className="card">
        <Empty title="Page not found" icon={Compass}>
          <p>The page you're looking for doesn't exist.</p>
          <Link to="/" className="btn btn-primary">Go to dashboard</Link>
        </Empty>
      </div>
    </div>
  );
}
