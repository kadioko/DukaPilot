const prisma = require("../lib/prisma");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function cleanText(value, max = 2000) {
  if (value === undefined || value === null) return null;
  return String(value).replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max) || null;
}

async function shareForToken(token) {
  const share = await prisma.quotationShare.findUnique({
    where: { token },
    include: {
      quotation: {
        select: {
          id: true,
          status: true,
          currentRevisionNumber: true,
          expiryDate: true,
          acceptedAt: true,
          acceptedByName: true,
          rejectionReason: true,
          revisions: { select: { revisionNumber: true, publicSnapshot: true } },
        },
      },
    },
  });
  if (!share) return null;
  const revision = share.quotation.revisions.find((item) => item.revisionNumber === share.revisionNumber);
  return revision ? { share, revision } : null;
}

function publicResponse(result, status) {
  return {
    ...result.revision.publicSnapshot,
    status,
    shareRevision: result.share.revisionNumber,
    canRespond: false,
  };
}

const get = asyncHandler(async (req, res) => {
  const result = await shareForToken(req.params.token);
  if (!result) return res.status(404).json({ error: "Quotation link not found" });
  const { share, revision } = result;
  if (!share.viewedAt) await prisma.quotationShare.update({ where: { id: share.id }, data: { viewedAt: new Date() } });
  const expired = share.quotation.expiryDate && share.quotation.expiryDate < new Date() && share.quotation.status === "SENT";
  if (expired) await prisma.quotation.updateMany({ where: { id: share.quotation.id, status: "SENT" }, data: { status: "EXPIRED" } });
  // This response is deliberately built from publicSnapshot only. It has no
  // IDs, tenant identifiers, costs, suppliers, margins, or private notes.
  res.json({ quotation: { ...revision.publicSnapshot, status: expired ? "EXPIRED" : share.quotation.status, shareRevision: share.revisionNumber, canRespond: !expired && share.quotation.status === "SENT" && share.quotation.currentRevisionNumber === share.revisionNumber } });
});

const accept = asyncHandler(async (req, res) => {
  const result = await shareForToken(req.params.token);
  if (!result) return res.status(404).json({ error: "Quotation link not found" });
  const { share } = result;
  const acceptingName = cleanText(req.body.acceptingName, 160);
  if (!acceptingName) return res.status(400).json({ error: "Your name is required to accept this quotation" });
  if (share.quotation.expiryDate && share.quotation.expiryDate < new Date()) return res.status(409).json({ error: "This quotation has expired" });
  const updated = await prisma.quotation.updateMany({
    where: { id: share.quotation.id, status: "SENT", currentRevisionNumber: share.revisionNumber },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByName: acceptingName, acceptanceComment: cleanText(req.body.comment), acceptanceSignature: cleanText(req.body.signature, 5000), lastEditedById: `public:${share.id}` },
  });
  if (updated.count !== 1) return res.status(409).json({ error: "This quotation has changed. Please ask the business to send the latest version." });
  await prisma.quotationShare.update({ where: { id: share.id }, data: { acceptedAt: new Date() } });
  req.audit = { action: "quotation.public.accept", resourceType: "quotation", resourceId: share.quotation.id, metadata: { revision: share.revisionNumber, acceptingName } };
  res.json({ message: "Quotation accepted", quotation: publicResponse(result, "ACCEPTED") });
});

const reject = asyncHandler(async (req, res) => {
  const result = await shareForToken(req.params.token);
  if (!result) return res.status(404).json({ error: "Quotation link not found" });
  const { share } = result;
  if (share.quotation.expiryDate && share.quotation.expiryDate < new Date()) return res.status(409).json({ error: "This quotation has expired" });
  const updated = await prisma.quotation.updateMany({
    where: { id: share.quotation.id, status: "SENT", currentRevisionNumber: share.revisionNumber },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: cleanText(req.body.reason), lastEditedById: `public:${share.id}` },
  });
  if (updated.count !== 1) return res.status(409).json({ error: "This quotation has changed. Please ask the business to send the latest version." });
  req.audit = { action: "quotation.public.reject", resourceType: "quotation", resourceId: share.quotation.id, metadata: { revision: share.revisionNumber } };
  res.json({ message: "Quotation rejected", quotation: publicResponse(result, "REJECTED") });
});

module.exports = { get, accept, reject };
