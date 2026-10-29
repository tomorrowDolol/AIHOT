// 比价在站上的位置：侧栏一节「比价」，后台一组「比价」。
import type { WebModule } from "@aihot/web/modules";
import { IconChart } from "@aihot/web/components/icons";

const web: WebModule = {
  name: "pricing",
  sidebar: { section: "比价", items: [{ to: "/pricing", label: "价格监控", icon: IconChart }] },
  admin: { groups: [{ group: "比价", items: [{ to: "/admin/pricing", label: "价格监控" }] }] },
};

export default web;
