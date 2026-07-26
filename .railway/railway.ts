import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("aliabdalla-maker/good-hour"),
    build: "npm run build",
  });

  return project("Good Hour", {
    resources: [web],
  });
});
