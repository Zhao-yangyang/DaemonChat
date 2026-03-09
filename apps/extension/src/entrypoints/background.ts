export default defineBackground(() => {
  // 点击扩展图标时打开侧边栏
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("sidePanel.setPanelBehavior", err));
});
