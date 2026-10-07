---
"blume": patch
---

The `blume-migrate` skill's Mintlify codemod keeps the brand icons Blume renders. It dropped every brand icon as having no Lucide equivalent, but Lucide still ships `facebook`, `github`, `gitlab`, `instagram`, `linkedin`, `slack`, `twitter`, and `youtube`, so an `icon: github` page lost an icon that would have rendered. The codemod now keeps those under the same name and still drops the brands Lucide lacks (`discord`, `x-twitter`, `docker`, and the like, plus `apple`, whose Lucide icon is the fruit), and the skill's Mintlify reference says the same.
