import RoleNavbar from "./RoleNavbar";

function RoleNotice({ title, message }) {
  return (
    <>
      <RoleNavbar title={title} />
      <main className="container admin-main">
        <div className="alert alert-info" role="status">{message}</div>
      </main>
    </>
  );
}

export default RoleNotice;
