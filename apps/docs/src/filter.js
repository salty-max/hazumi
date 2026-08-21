// Filters both the sidebar and the body to whatever matches.
const input = document.getElementById("filter");
const entries = [...document.querySelectorAll(".entry")];
const navItems = [...document.querySelectorAll("#nav li")];
const groups = [...document.querySelectorAll(".nav-group")];
const sections = [...document.querySelectorAll(".module")];

input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();

  for (const entry of entries) {
    const name = entry.id.split("-").slice(1).join("-").toLowerCase();
    entry.hidden = q.length > 0 && !name.includes(q);
  }
  for (const item of navItems) {
    const name = (item.textContent || "").toLowerCase();
    item.hidden = q.length > 0 && !name.includes(q);
  }
  // Hide a whole module once nothing in it survives the filter.
  for (const section of sections) {
    section.hidden = [...section.querySelectorAll(".entry")].every((e) => e.hidden);
  }
  for (const group of groups) {
    group.hidden = [...group.querySelectorAll("li")].every((li) => li.hidden);
  }
});
