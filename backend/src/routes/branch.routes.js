const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const c = require("../controllers/branch.controller");
router.use(authenticate, c.ownerOnly);
router.use((req, res, next) => {
  const archiveOnly = req.method === "PATCH"
    && req.body?.branchArchived === true
    && Object.keys(req.body).every((key) => key === "branchArchived");
  if (archiveOnly) return next();
  return requireActiveSubscription(req, res, next);
});
router.get("/", c.list);
router.get("/overview", c.overview);
router.get("/products", require("../controllers/branchTransfer.controller").products);
router.post("/transfers", require("../controllers/branchTransfer.controller").transfer);
router.post("/", c.create);
router.patch("/:id", c.update);
module.exports = router;
