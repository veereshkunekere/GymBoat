import * as service from "./whatsapp.service.js";

export const overview = async (req, res, next) => { try { res.json({ success: true, data: await service.getOverview(req.user._id) }); } catch (e) { next(e); } };
export const updateSettings = async (req, res, next) => { try { res.json({ success: true, data: await service.updateSettings(req.user._id, req.body) }); } catch (e) { next(e); } };
export const sendToMember = async (req, res, next) => { try { const data = await service.sendToMember(req.user._id, req.body); res.status(201).json({ success: true, message: "WhatsApp template message submitted", data }); } catch (e) { next(e); } };
export const sendTest = async (req, res, next) => { try { const data = await service.sendTest(req.user._id, req.body); res.status(201).json({ success: true, message: "Test message submitted", data }); } catch (e) { next(e); } };
