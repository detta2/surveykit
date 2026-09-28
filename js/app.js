/* app.js — navigasi tab + inisialisasi malas tiap tool */
(function () {
  'use strict';
  var tools = {
    converter: function () { window.ToolConverter.init(); },
    profile: function () { window.ToolProfile.init(); window.ToolProfile.refresh(); },
    contour: function () { window.ToolContour.init(); window.ToolContour.refresh(); },
    measure: function () { window.ToolMeasure.init(); window.ToolMeasure.refresh(); }
  };
  var loaded = {};

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tool-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (tools[name]) {
      if (!loaded[name]) { loaded[name] = true; }
      tools[name]();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });
    switchTab('converter');
  });
})();
