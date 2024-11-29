import { useLocation } from "react-router-dom";

const VersionDetailPage = () => {
  const location = useLocation();
  const { version } = location.state || {}; // Default to an empty object if state is null
  console.log(location.state);
  if (!version) {
    return <div>Loading...</div>; // You can show a loading state or an error message
  }

  return (
    <div>
      {/* Render your version details */}
      <h1>{version.Version}</h1>
      {/* Other details */}
    </div>
  );
};

export { VersionDetailPage };
