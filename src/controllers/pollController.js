const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

/**
 * ดึงข้อมูลผู้เช่าจาก tenantId (Backend JWT) ก่อน แล้วค่อย fallback ไปที่ lineUserId (LINE ID Token)
 * รูปแบบเดียวกับ announcementController — รองรับทั้ง 2 ทางที่ liffAuthMiddleware อาจ set มาให้
 */
async function resolveTenant(req) {
  const { tenantId, lineUserId } = req;
  let tenant = null;
  if (tenantId) {
    tenant = await billingService.prisma.tenant.findUnique({ where: { id: tenantId }, include: { rooms: true } });
  }
  if (!tenant && lineUserId) {
    tenant = await billingService.prisma.tenant.findUnique({ where: { lineUserId }, include: { rooms: true } });
  }
  return tenant;
}

class PollController {
  /**
   * แอดมินสร้างโพลใหม่ และบรอดแคสต์แจ้งเตือนไปยังลูกบ้านในตึก (POST /api/admin/buildings/:buildingId/polls)
   */
  async createPoll(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { question, options, opensAt, closesAt } = req.body;

      if (!question || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ question และ options อย่างน้อย 2 ตัวเลือก'
        });
      }

      const poll = await billingService.prisma.poll.create({
        data: {
          buildingId,
          question,
          options,
          opensAt: opensAt ? new Date(opensAt) : null,
          closesAt: closesAt ? new Date(closesAt) : null
        }
      });

      // บรอดแคสต์แจ้งเตือนไปยังลูกบ้านทุกคนในตึกที่ผูก lineUserId ไว้แล้ว
      const tenants = await billingService.prisma.tenant.findMany({
        where: { lineUserId: { not: null }, rooms: { some: { buildingId } } },
        select: { lineUserId: true }
      });
      await Promise.all(
        tenants.map((t) => lineService.pushPollNotification(t.lineUserId, poll))
      );

      return res.status(201).json({
        success: true,
        message: `สร้างโพล "${question}" และแจ้งเตือนลูกบ้าน ${tenants.length} คนเรียบร้อยแล้ว`,
        data: poll
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการโพลของตึกสำหรับแอดมิน (GET /api/admin/buildings/:buildingId/polls)
   */
  async getPollsForAdmin(req, res, next) {
    try {
      const { buildingId } = req.params;
      const polls = await billingService.prisma.poll.findMany({
        where: { buildingId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { votes: true } } }
      });
      return res.status(200).json({ success: true, data: polls });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินแก้ไขโพล — ห้ามแก้ options ถ้ามีคนโหวตแล้ว เพราะ optionIndex อ้างอิงตามตำแหน่ง (PATCH /api/admin/polls/:id)
   */
  async updatePoll(req, res, next) {
    try {
      const { id } = req.params;
      const { question, options, opensAt, closesAt, isActive } = req.body;

      const poll = await billingService.prisma.poll.findUnique({
        where: { id },
        include: { _count: { select: { votes: true } } }
      });
      if (!poll) {
        return res.status(404).json({ success: false, message: 'ไม่พบโพลที่ต้องการแก้ไข' });
      }

      if (options && poll._count.votes > 0) {
        return res.status(400).json({
          success: false,
          message: 'ไม่สามารถแก้ไขตัวเลือกได้ เพราะมีคนโหวตไปแล้ว'
        });
      }

      const updatedPoll = await billingService.prisma.poll.update({
        where: { id },
        data: {
          ...(question !== undefined ? { question } : {}),
          ...(options !== undefined ? { options } : {}),
          ...(opensAt !== undefined ? { opensAt: opensAt ? new Date(opensAt) : null } : {}),
          ...(closesAt !== undefined ? { closesAt: closesAt ? new Date(closesAt) : null } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
        }
      });

      return res.status(200).json({ success: true, message: 'อัปเดตโพลเรียบร้อยแล้ว', data: updatedPoll });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินลบโพล (DELETE /api/admin/polls/:id)
   */
  async deletePoll(req, res, next) {
    try {
      const { id } = req.params;
      const poll = await billingService.prisma.poll.findUnique({ where: { id } });
      if (!poll) {
        return res.status(404).json({ success: false, message: 'ไม่พบโพลที่ต้องการลบ' });
      }
      await billingService.prisma.poll.delete({ where: { id } });
      return res.status(200).json({ success: true, message: `ลบโพล "${poll.question}" เรียบร้อยแล้ว` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินดูผลโหวตของโพล (GET /api/admin/polls/:id/results)
   */
  async getPollResults(req, res, next) {
    try {
      const { id } = req.params;
      const poll = await billingService.prisma.poll.findUnique({ where: { id } });
      if (!poll) {
        return res.status(404).json({ success: false, message: 'ไม่พบโพลที่ต้องการดูผล' });
      }

      const tally = await billingService.prisma.pollVote.groupBy({
        by: ['optionIndex'],
        where: { pollId: id },
        _count: true
      });

      const options = Array.isArray(poll.options) ? poll.options : [];
      const results = options.map((label, index) => ({
        optionIndex: index,
        label,
        votes: tally.find((t) => t.optionIndex === index)?._count || 0
      }));
      const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

      return res.status(200).json({ success: true, data: { poll, results, totalVotes } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการโพลที่ยัง Active สำหรับ LIFF พร้อมสถานะ hasVoted ของผู้เช่า (GET /api/v1/liff/polls)
   */
  async getPollsForLiff(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(200).json({ success: true, data: [] });
      }

      const tenantBuildingId = tenant.rooms?.[0]?.buildingId || null;
      const now = new Date();

      const polls = await billingService.prisma.poll.findMany({
        where: {
          isActive: true,
          OR: [{ buildingId: null }, { buildingId: tenantBuildingId }],
          AND: [
            { OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
            { OR: [{ closesAt: null }, { closesAt: { gte: now } }] }
          ]
        },
        orderBy: { createdAt: 'desc' },
        include: { votes: { where: { tenantId: tenant.id } } }
      });

      const formatted = polls.map((poll) => {
        const myVote = poll.votes[0] || null;
        const { votes, ...rest } = poll;
        return {
          ...rest,
          hasVoted: Boolean(myVote),
          myOptionIndex: myVote ? myVote.optionIndex : null
        };
      });

      return res.status(200).json({ success: true, data: formatted });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านโหวตโพล — 1 คนโหวตได้ 1 ครั้งต่อโพล (POST /api/v1/liff/polls/:id/vote)
   * ห้ามรับ tenantId จาก Client ตรง ๆ (IDOR) ต้อง derive จาก req.tenantId/req.lineUserId ที่ verify แล้วเท่านั้น
   */
  async voteOnPoll(req, res, next) {
    try {
      const { id } = req.params;
      const { optionIndex } = req.body;

      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const poll = await billingService.prisma.poll.findUnique({ where: { id } });
      if (!poll) {
        return res.status(404).json({ success: false, message: 'ไม่พบโพลนี้' });
      }

      // เช็ค FeatureToggle ของตึกผู้เช่า (inline แทนการทำ middleware แยก เพราะต้อง resolve tenant->room->building ก่อน)
      const tenantBuildingId = tenant.rooms?.[0]?.buildingId || null;
      if (tenantBuildingId) {
        const toggle = await billingService.prisma.featureToggle.findFirst({
          where: { key: 'ENABLE_VOTING', buildingId: tenantBuildingId }
        });
        if (toggle && !toggle.isActive) {
          return res.status(403).json({ success: false, message: 'ฟีเจอร์โหวตถูกปิดใช้งานสำหรับตึกนี้' });
        }
      }

      const now = new Date();
      if (!poll.isActive || (poll.opensAt && poll.opensAt > now) || (poll.closesAt && poll.closesAt < now)) {
        return res.status(400).json({ success: false, message: 'โพลนี้ปิดรับโหวตแล้ว' });
      }

      const options = Array.isArray(poll.options) ? poll.options : [];
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
        return res.status(400).json({ success: false, message: 'กรุณาเลือกตัวเลือกที่ถูกต้อง' });
      }

      const existingVote = await billingService.prisma.pollVote.findUnique({
        where: { pollId_tenantId: { pollId: id, tenantId: tenant.id } }
      });
      if (existingVote) {
        return res.status(409).json({ success: false, message: 'คุณโหวตโพลนี้ไปแล้ว' });
      }

      const vote = await billingService.prisma.pollVote.create({
        data: { pollId: id, tenantId: tenant.id, optionIndex }
      });

      return res.status(201).json({ success: true, message: 'บันทึกการโหวตเรียบร้อยแล้ว', data: vote });
    } catch (error) {
      // เผื่อกรณี Race Condition ชน unique constraint พร้อมกันพอดี (Concurrent Request)
      if (error.code === 'P2002') {
        return res.status(409).json({ success: false, message: 'คุณโหวตโพลนี้ไปแล้ว' });
      }
      next(error);
    }
  }
}

module.exports = new PollController();
