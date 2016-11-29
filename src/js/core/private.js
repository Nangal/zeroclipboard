/**
 * The underlying implementation of `ZeroClipboard.config`.
 * @private
 */
var _config = function(options) {
  if (typeof options === "object" && options && !("length" in options)) {
    _keys(options).forEach(function(prop) {
      // These configuration values CAN be modified while a SWF is actively embedded.
      if (/^(?:forceHandCursor|title|zIndex|bubbleEvents|fixLineEndings)$/.test(prop)) {
        _globalConfig[prop] = options[prop];
      }
      // All other configuration values CANNOT be modified while a SWF is actively embedded.
      else if (_flashState.bridge == null) {
        if (prop === "containerId" || prop === "swfObjectId") {
          // Validate values against the HTML4 spec for `ID` and `Name` tokens
          if (_isValidHtml4Id(options[prop])) {
            _globalConfig[prop] = options[prop];
          }
          else {
            throw new Error("The specified `" + prop + "` value is not valid as an HTML4 Element ID");
          }
        }
        else {
          _globalConfig[prop] = options[prop];
        }
      }
    });
  }

  if (typeof options === "string" && options) {
    if (_hasOwn.call(_globalConfig, options)) {
      // TODO: MAYBE do a `_deepCopy` of this as well? It is convenient to NOT
      // do a `_deepCopy` if we want to allow consumers to, for example, be
      // able to update the `trustedDomains` array on their own terms rather
      // than having to send in a whole new array.
      return _globalConfig[options];
    }
    // else `return undefined;`
    return;
  }

  return _deepCopy(_globalConfig);
};


/**
 * The underlying implementation of `ZeroClipboard.state`.
 * @private
 */
var _state = function() {
  // Always reassess the `sandboxed` state of the page at important Flash-related moments
  _detectSandbox();

  return {
    browser: _extend(_pick(_navigator, ["userAgent", "platform", "appName", "appVersion"]), { "isSupported": _isBrowserSupported() }),
    flash: _omit(_flashState, ["bridge"]),
    zeroclipboard: {
      version: ZeroClipboard.version,
      config: ZeroClipboard.config()
    }
  };
};


/**
 * Does this browser support all of the necessary DOM and JS features necessary?
 * @private
 */
var _isBrowserSupported = function() {
  return !!(
    // DOM Level 2
    _document.addEventListener &&
    // ECMAScript 5.1
    _window.Object.keys &&
    _window.Array.prototype.map
  );
};


/**
 * The underlying implementation of `ZeroClipboard.isFlashUnusable`.
 * @private
 */
var _isFlashUnusable = function() {
  return !!(
    _flashState.sandboxed ||
    _flashState.disabled ||
    _flashState.outdated ||
    _flashState.unavailable ||
    _flashState.degraded ||
    _flashState.deactivated
  );
};


/**
 * The underlying implementation of `ZeroClipboard.on`.
 * @private
 */
var _on = function(eventType, listener) {
  var i, len, events,
      added = {};

  if (typeof eventType === "string" && eventType) {
    events = eventType.toLowerCase().split(/\s+/);
  }
  else if (typeof eventType === "object" && eventType && !("length" in eventType) && typeof listener === "undefined") {
    _keys(eventType).forEach(function(key) {
      var listener = eventType[key];
      if (typeof listener === "function") {
        ZeroClipboard.on(key, listener);
      }
    });
  }

  if (events && events.length && listener) {
    for (i = 0, len = events.length; i < len; i++) {
      eventType = events[i].replace(/^on/, "");
      added[eventType] = true;
      if (!_handlers[eventType]) {
        _handlers[eventType] = [];
      }
      _handlers[eventType].push(listener);
    }

    // The following events must be memorized and fired immediately if relevant as they only occur
    // once per Flash object load.

    // If the SWF was already loaded, we're à gogo!
    if (added.ready && _flashState.ready) {
      ZeroClipboard.emit({
        type: "ready"
      });
    }
    if (added.error) {
      if (!_isBrowserSupported()) {
        ZeroClipboard.emit({
          type: "error",
          name: "browser-unsupported"
        });
      }
      for (i = 0, len = _flashStateErrorNames.length; i < len; i++) {
        if (_flashState[_flashStateErrorNames[i].replace(/^flash-/, "")] === true) {
          ZeroClipboard.emit({
            type: "error",
            name: _flashStateErrorNames[i]
          });
          // Stop after the first `_flashState` error is found (should be the most severe)
          break;
        }
      }

      if (_zcSwfVersion !== undefined && ZeroClipboard.version !== _zcSwfVersion) {
        ZeroClipboard.emit({
          type: "error",
          name: "version-mismatch",
          jsVersion: ZeroClipboard.version,
          swfVersion: _zcSwfVersion
        });
      }
    }
  }

  return ZeroClipboard;
};


/**
 * The underlying implementation of `ZeroClipboard.off`.
 * @private
 */
var _off = function(eventType, listener) {
  var i, len, foundIndex, events, perEventHandlers;
  if (arguments.length === 0) {
    // Remove ALL of the _handlers for ALL event types
    events = _keys(_handlers);
  }
  else if (typeof eventType === "string" && eventType) {
    events = eventType.toLowerCase().split(/\s+/);
  }
  else if (typeof eventType === "object" && eventType && !("length" in eventType) && typeof listener === "undefined") {
    _keys(eventType).forEach(function(key) {
      var listener = eventType[key];
      if (typeof listener === "function") {
        ZeroClipboard.off(key, listener);
      }
    });
  }

  if (events && events.length) {
    for (i = 0, len = events.length; i < len; i++) {
      eventType = events[i].replace(/^on/, "");
      perEventHandlers = _handlers[eventType];
      if (perEventHandlers && perEventHandlers.length) {
        if (listener) {
          foundIndex = perEventHandlers.indexOf(listener);
          while (foundIndex !== -1) {
            perEventHandlers.splice(foundIndex, 1);
            foundIndex = perEventHandlers.indexOf(listener, foundIndex);
          }
        }
        else {
          // If no `listener` was provided, remove ALL of the handlers for this event type
          perEventHandlers.length = 0;
        }
      }
    }
  }

  return ZeroClipboard;
};


/**
 * The underlying implementation of `ZeroClipboard.handlers`.
 * @private
 */
var _listeners = function(eventType) {
  var copy;
  if (typeof eventType === "string" && eventType) {
    copy = _deepCopy(_handlers[eventType]) || null;
  }
  else {
    copy = _deepCopy(_handlers);
  }
  return copy;
};


/**
 * The underlying implementation of `ZeroClipboard.emit`.
 * @private
 */
var _emit = function(event) {
  var eventCopy, returnVal, tmp;

  // Create an event object for this event type
  event = _createEvent(event);

  if (!event) {
    return;
  }

  // Preprocess any special behaviors, reactions, or state changes after receiving this event
  if (_preprocessEvent(event)) {
    return;
  }

  // If this was a Flash "ready" event that was overdue, bail out and fire an "error" event instead
  if (event.type === "ready" && _flashState.overdue === true) {
    return ZeroClipboard.emit({ type: "error", name: "flash-overdue" });
  }

  // Trigger any and all registered event handlers
  eventCopy = _extend({}, event);
  _dispatchCallbacks.call(this, eventCopy);

  // For the `copy` event, be sure to return the `_clipData` to Flash to be injected into the clipboard
  if (event.type === "copy") {
    tmp = _mapClipDataToFlash(_clipData);
    returnVal = tmp.data;
    _clipDataFormatMap = tmp.formatMap;
  }
  return returnVal;
};


/**
 * Get the protocol of the configured SWF path.
 * @private
 */
var _getSwfPathProtocol = function() {
  var swfPath = _globalConfig.swfPath || "",
      swfPathFirstTwoChars = swfPath.slice(0, 2),
      swfProtocol = swfPath.slice(0, swfPath.indexOf("://") + 1);

  return (
    // If swfPath is a UNC path (`file://`-based)
    swfPathFirstTwoChars === "\\\\" ?
      "file:" :
      (
        // If no protocol, or relative protocol, then...
        swfPathFirstTwoChars === "//" || swfProtocol === "" ?
          // use the page's protocol
          _window.location.protocol :
          // otherwise, use the protocol from the SWF path
          swfProtocol
      )
  );
};


/**
 * The underlying implementation of `ZeroClipboard.create`.
 * @private
 */
var _create = function() {
  var maxWait, swfProtocol,
      // Make note of the most recent sandbox assessment
      previousState = _flashState.sandboxed;

  if (!_isBrowserSupported()) {
    _flashState.ready = false;
    ZeroClipboard.emit({ type: "error", name: "browser-unsupported" });
    return;
  }

  // Always reassess the `sandboxed` state of the page at important Flash-related moments
  _detectSandbox();

  // Setup the Flash <-> JavaScript bridge
  if (typeof _flashState.ready !== "boolean") {
    _flashState.ready = false;
  }

  // If the page is newly sandboxed (or newly understood to be sandboxed), inform the consumer
  if (_flashState.sandboxed !== previousState && _flashState.sandboxed === true) {
    _flashState.ready = false;
    ZeroClipboard.emit({ type: "error", name: "flash-sandboxed" });
  }
  else if (!ZeroClipboard.isFlashUnusable() && _flashState.bridge === null) {
    swfProtocol = _getSwfPathProtocol();

    if (swfProtocol && swfProtocol !== _window.location.protocol) {
      ZeroClipboard.emit({ type: "error", name: "flash-insecure" });
    }
    else {
      maxWait = _globalConfig.flashLoadTimeout;
      if (typeof maxWait === "number" && maxWait >= 0) {
        _flashCheckTimeout = _setTimeout(function() {
          // If it took longer than `_globalConfig.flashLoadTimeout` milliseconds to receive
          // a `ready` event, so consider Flash "deactivated".
          if (typeof _flashState.deactivated !== "boolean") {
            _flashState.deactivated = true;
          }
          if (_flashState.deactivated === true) {
            ZeroClipboard.emit({ type: "error", name: "flash-deactivated" });
          }
        }, maxWait);
      }

      // If attempting a fresh SWF embedding, it is safe to ignore the `overdue` status
      _flashState.overdue = false;

      // Embed the SWF
      _embedSwf();
    }
  }
};


/**
 * The underlying implementation of `ZeroClipboard.destroy`.
 * @private
 */
var _destroy = function() {
  // Clear any pending clipboard data
  ZeroClipboard.clearData();

  // Deactivate during self-destruct, even if `_globalConfig.autoActivate` !== `true`
  ZeroClipboard.blur();

  // Emit a special [synchronously handled] event so that Clients may listen
  // for it and destroy themselves
  ZeroClipboard.emit("destroy");

  // Un-embed the SWF
  _unembedSwf();

  // Remove all event handlers
  ZeroClipboard.off();
};


/**
 * The underlying implementation of `ZeroClipboard.setData`.
 * @private
 */
var _setData = function(format, data) {
  var dataObj;

  if (typeof format === "object" && format && typeof data === "undefined") {
    dataObj = format;

    // Clear out existing pending data if an object is provided
    ZeroClipboard.clearData();
  }
  else if (typeof format === "string" && format) {
    dataObj = {};
    dataObj[format] = data;
  }
  else {
    return;
  }

  // Copy over owned properties with non-empty string values
  for (var dataFormat in dataObj) {
    if (
      typeof dataFormat === "string" && dataFormat && _hasOwn.call(dataObj, dataFormat) &&
      typeof dataObj[dataFormat] === "string" && dataObj[dataFormat]
    ) {
      _clipData[dataFormat] = _fixLineEndings(dataObj[dataFormat]);
    }
  }
};


/**
 * The underlying implementation of `ZeroClipboard.clearData`.
 * @private
 */
var _clearData = function(format) {
  // If no format is passed, delete all of the pending data
  if (typeof format === "undefined") {
    _deleteOwnProperties(_clipData);
    _clipDataFormatMap = null;
  }
  // Otherwise, delete only the pending data of the specified format
  else if (typeof format === "string" && _hasOwn.call(_clipData, format)) {
    delete _clipData[format];
  }
};


/**
 * The underlying implementation of `ZeroClipboard.getData`.
 * @private
 */
var _getData = function(format) {
  // If no format is passed, get a copy of ALL of the pending data
  if (typeof format === "undefined") {
    return _deepCopy(_clipData);
  }
  // Otherwise, get only the pending data of the specified format
  else if (typeof format === "string" && _hasOwn.call(_clipData, format)) {
    return _clipData[format];
  }
};


/**
 * The underlying implementation of `ZeroClipboard.focus`/`ZeroClipboard.activate`.
 * @private
 */
var _focus = function(element) {
  if (!(element && element.nodeType === 1)) {
    return;
  }

  // "Ignore" the currently active element
  if (_currentElement) {
    _removeClass(_currentElement, _globalConfig.activeClass);

    if (_currentElement !== element) {
      _removeClass(_currentElement, _globalConfig.hoverClass);
    }
  }

  // Mark the element as currently activated
  _currentElement = element;
  _addClass(element, _globalConfig.hoverClass);

  // If the element has a title, mimic it
  var newTitle = element.getAttribute("title") || _globalConfig.title;
  if (typeof newTitle === "string" && newTitle) {
    var htmlBridge = _getHtmlBridge(_flashState.bridge);
    if (htmlBridge) {
      htmlBridge.setAttribute("title", newTitle);
    }
  }

  // If the element has a pointer style, set to hand cursor
  var useHandCursor = _globalConfig.forceHandCursor === true || _getStyle(element, "cursor") === "pointer";
  // Update the hand cursor state without updating the `forceHandCursor` option
  _setHandCursor(useHandCursor);

  // Move the Flash object over the newly activated element
  _reposition();
};


/**
 * The underlying implementation of `ZeroClipboard.blur`/`ZeroClipboard.deactivate`.
 * @private
 */
var _blur = function() {
  // Hide the Flash object off-screen
  var htmlBridge = _getHtmlBridge(_flashState.bridge);
  if (htmlBridge) {
    htmlBridge.removeAttribute("title");
    htmlBridge.style.left = "0px";
    htmlBridge.style.top = "-9999px";
    htmlBridge.style.width = "1px";
    htmlBridge.style.height = "1px";
  }

  // "Ignore" the currently active element
  if (_currentElement) {
    _removeClass(_currentElement, _globalConfig.hoverClass);
    _removeClass(_currentElement, _globalConfig.activeClass);
    _currentElement = null;
  }
};


/**
 * The underlying implementation of `ZeroClipboard.activeElement`.
 * @private
 */
var _activeElement = function() {
  return _currentElement || null;
};



//
// Helper functions
//

/**
 * Check if a value is a valid HTML4 `ID` or `Name` token.
 * @private
 */
var _isValidHtml4Id = function(id) {
  return typeof id === "string" && id && /^[A-Za-z][A-Za-z0-9_:\-\.]*$/.test(id);
};


/**
 * Create or update an `event` object, based on the `eventType`.
 * @private
 */
var _createEvent = function(event) {
  /*jshint maxstatements:32 */

  var eventType;
  if (typeof event === "string" && event) {
    eventType = event;
    event = {};
  }
  else if (typeof event === "object" && event && typeof event.type === "string" && event.type) {
    eventType = event.type;
  }

  // Bail if we don't have an event type
  if (!eventType) {
    return;
  }

  eventType = eventType.toLowerCase();

  // Sanitize the event type and set the `target` and `relatedTarget` properties if not already set
  if (!event.target &&
    (
      /^(copy|aftercopy|_click)$/.test(eventType) ||
      (eventType === "error" && event.name === "clipboard-error")
    )
  ) {
    event.target = _copyTarget;
  }

  _extend(event, {
    type: eventType,
    target: event.target || _currentElement || null,
    relatedTarget: event.relatedTarget || null,
    currentTarget: (_flashState && _flashState.bridge) || null,
    timeStamp: event.timeStamp || _now() || null
  });

  var msg = _eventMessages[event.type];
  if (event.type === "error" && event.name && msg) {
    msg = msg[event.name];
  }
  if (msg) {
    event.message = msg;
  }

  if (event.type === "ready") {
    _extend(event, {
      target: null,
      version: _flashState.version
    });
  }

  if (event.type === "error") {
    if (_flashStateErrorNameMatchingRegex.test(event.name)) {
      _extend(event, {
        target: null,
        minimumVersion: _minimumFlashVersion
      });
    }
    if (_flashStateEnabledErrorNameMatchingRegex.test(event.name)) {
      _extend(event, {
        version: _flashState.version
      });
    }
    if (event.name === "flash-insecure") {
      _extend(event, {
        pageProtocol: _window.location.protocol,
        swfProtocol: _getSwfPathProtocol()
      });
    }
  }

  // Add all of the special properties and methods for a `copy` event
  if (event.type === "copy") {
    event.clipboardData = {
      setData: ZeroClipboard.setData,
      clearData: ZeroClipboard.clearData
    };
  }

  if (event.type === "aftercopy") {
    event = _mapClipResultsFromFlash(event, _clipDataFormatMap);
  }

  if (event.target && !event.relatedTarget) {
    event.relatedTarget = _getRelatedTarget(event.target);
  }

  return _addMouseData(event);
};


/**
 * Get a relatedTarget from the target's `data-clipboard-target` attribute
 * @private
 */
var _getRelatedTarget = function(targetEl) {
  var relatedTargetId = targetEl && targetEl.getAttribute && targetEl.getAttribute("data-clipboard-target");
  return relatedTargetId ? _document.getElementById(relatedTargetId) : null;
};


/**
 * Add element and position data to `MouseEvent` instances
 * @private
 */
var _addMouseData = function(event) {
  if (event && /^_(?:click|mouse(?:over|out|down|up|move))$/.test(event.type)) {
    // Element data
    var srcElement  = event.target;
    var fromElement = event.type === "_mouseover" && event.relatedTarget ? event.relatedTarget : undefined;
    var toElement   = event.type === "_mouseout"  && event.relatedTarget ? event.relatedTarget : undefined;

    // Calculate positional data
    var pos = _getElementPosition(srcElement);
    var screenLeft = _window.screenLeft || _window.screenX || 0;
    var screenTop  = _window.screenTop  || _window.screenY || 0;
    var scrollLeft = _document.body.scrollLeft + _document.documentElement.scrollLeft;
    var scrollTop  = _document.body.scrollTop  + _document.documentElement.scrollTop;
    var pageX = pos.left + (typeof event._stageX === "number" ? event._stageX : 0);
    var pageY = pos.top  + (typeof event._stageY === "number" ? event._stageY : 0);
    var clientX = pageX - scrollLeft;
    var clientY = pageY - scrollTop;
    var screenX = screenLeft + clientX;
    var screenY = screenTop  + clientY;
    var moveX = typeof event.movementX === "number" ? event.movementX : 0;
    var moveY = typeof event.movementY === "number" ? event.movementY : 0;

    // Remove these transient properties, if present
    delete event._stageX;
    delete event._stageY;

    // Update the appropriate properties of `event`, mostly with position data.
    // Good notes:
    //   http://www.jacklmoore.com/notes/mouse-position/
    _extend(event, {
      srcElement: srcElement,
      fromElement: fromElement,
      toElement: toElement,
      screenX: screenX,  // screenLeft + clientX
      screenY: screenY,  // screenTop  + clientY
      pageX: pageX,      // scrollLeft + clientX
      pageY: pageY,      // scrollTop  + clientY
      clientX: clientX,  // pageX - scrollLeft
      clientY: clientY,  // pageY - scrollTop
      x: clientX,        // clientX
      y: clientY,        // clientY
      movementX: moveX,  // movementX
      movementY: moveY,  // movementY
      offsetX: 0,        // Unworthy of calculation
      offsetY: 0,        // Unworthy of calculation
      layerX: 0,         // Unworthy of calculation
      layerY: 0          // Unworthy of calculation
    });
  }

  return event;
};


/**
 * Determine if an event's registered handlers should be execute synchronously or asynchronously.
 *
 * @returns {boolean}
 * @private
 */
var _shouldPerformAsync = function(event) {
  var eventType = (event && typeof event.type === "string" && event.type) || "";

  // Determine if the event handlers for this event can be performed asynchronously.
  //  - `beforecopy`: This event's callback cannot be performed asynchronously because the
  //                  subsequent `copy` event cannot.
  //  - `copy`: This event's callback cannot be performed asynchronously as it would prevent the
  //            user from being able to call `.setText` successfully before the pending clipboard
  //            injection associated with this event fires.
  //  - `destroy`: This event's callback cannot be performed asynchronously as it is necessary
  //               to allow any downstream clients the chance to destroy themselves as well
  //               as well before the final destruction of the SWF object and removal of all
  //               registered event handlers.
  //  - The handlers for all other event types should be performed asynchronously.
  return !/^(?:(?:before)?copy|destroy)$/.test(eventType);
};


/**
 * Control if a callback should be executed asynchronously or not.
 *
 * @returns `undefined`
 * @private
 */
var _dispatchCallback = function(func, context, args, async) {
  if (async) {
    _setTimeout(function() {
      func.apply(context, args);
    }, 0);
  }
  else {
    func.apply(context, args);
  }
};


/**
 * Handle the actual dispatching of events to client instances.
 *
 * @returns `undefined`
 * @private
 */
var _dispatchCallbacks = function(event) {
  if (!(typeof event === "object" && event && event.type)) {
    return;
  }

  var async = _shouldPerformAsync(event);

  // User defined handlers for events
  var wildcardTypeHandlers = _handlers["*"] || [];
  var specificTypeHandlers = _handlers[event.type] || [];
  // Execute wildcard handlers before type-specific handlers
  var handlers = wildcardTypeHandlers.concat(specificTypeHandlers);

  if (handlers && handlers.length) {
    var i, len, func, context, eventCopy,
        originalContext = this;
    for (i = 0, len = handlers.length; i < len; i++) {
      func = handlers[i];
      context = originalContext;

      // If the user provided a string for their callback, grab that function
      if (typeof func === "string" && typeof _window[func] === "function") {
        func = _window[func];
      }
      if (typeof func === "object" && func && typeof func.handleEvent === "function") {
        context = func;
        func = func.handleEvent;
      }

      if (typeof func === "function") {
        eventCopy = _extend({}, event);
        _dispatchCallback(func, context, [eventCopy], async);
      }
    }
  }
  return this;
};


/**
 * Check an `error` event's `name` property to see if Flash has
 * already loaded, which rules out possible `iframe` sandboxing.
 * @private
 */
var _getSandboxStatusFromErrorEvent = function(event) {
  var isSandboxed = null;  // `null` === uncertain

  if (
    // If the page is not framed, bail out immediately
    _pageIsFramed === false ||
    (
      event &&
      event.type === "error" &&
      event.name &&
      _errorsThatOnlyOccurAfterFlashLoads.indexOf(event.name) !== -1
    )
  ) {
    isSandboxed = false;  // `false` === not sandboxed
  }

  return isSandboxed;
};


/**
 * Preprocess any special behaviors, reactions, or state changes after receiving this event.
 * Executes only once per event emitted, NOT once per client.
 * @private
 */
var _preprocessEvent = function(event) {
  /*jshint maxstatements:28 */

  var element = event.target || _currentElement || null;

  var sourceIsSwf = event._source === "swf";
  delete event._source;

  switch (event.type) {
    case "error":
      var isSandboxed = event.name === "flash-sandboxed" || _getSandboxStatusFromErrorEvent(event);
      if (typeof isSandboxed === "boolean") {
        _flashState.sandboxed = isSandboxed;
      }

      if (event.name === "browser-unsupported") {
        _extend(_flashState, {
          disabled:    false,
          outdated:    false,
          unavailable: false,
          degraded:    false,
          deactivated: false,
          overdue:     false,
          ready:       false
        });
      }
      else if (_flashStateErrorNames.indexOf(event.name) !== -1) {
        _extend(_flashState, {
          disabled:    event.name === "flash-disabled",
          outdated:    event.name === "flash-outdated",
          insecure:    event.name === "flash-insecure",
          unavailable: event.name === "flash-unavailable",
          degraded:    event.name === "flash-degraded",
          deactivated: event.name === "flash-deactivated",
          overdue:     event.name === "flash-overdue",
          ready:       false
        });
      }
      else if (event.name === "version-mismatch") {
        _zcSwfVersion = event.swfVersion;

        _extend(_flashState, {
          disabled:    false,
          outdated:    false,
          insecure:    false,
          unavailable: false,
          degraded:    false,
          deactivated: false,
          overdue:     false,
          ready:       false
        });
      }

      // Remove for cleanliness
      _clearTimeoutsAndPolling();

      break;

    case "ready":
      _zcSwfVersion = event.swfVersion;

      var wasDeactivated = _flashState.deactivated === true;
      _extend(_flashState, {
        sandboxed:   false,
        disabled:    false,
        outdated:    false,
        insecure:    false,
        unavailable: false,
        degraded:    false,
        deactivated: false,
        overdue:     wasDeactivated,
        ready:       !wasDeactivated
      });

      // Remove for cleanliness
      _clearTimeoutsAndPolling();

      break;

    case "beforecopy":
      _copyTarget = element;
      break;

    case "copy":
      var textContent,
          htmlContent,
          targetEl = event.relatedTarget;
      if (
        !(_clipData["text/html"] || _clipData["text/plain"]) &&
        targetEl &&
        (htmlContent = targetEl.value || targetEl.outerHTML || targetEl.innerHTML) &&
        (textContent = targetEl.value || targetEl.textContent || targetEl.innerText)
      ) {
        event.clipboardData.clearData();
        event.clipboardData.setData("text/plain", textContent);
        if (htmlContent !== textContent) {
          event.clipboardData.setData("text/html", htmlContent);
        }
      }
      else if (!_clipData["text/plain"] && event.target && (textContent = event.target.getAttribute("data-clipboard-text"))) {
        event.clipboardData.clearData();
        event.clipboardData.setData("text/plain", textContent);
      }
      break;

    case "aftercopy":
      _queueEmitClipboardErrors(event);

      // If the copy has [or should have] occurred, clear out all of the data
      ZeroClipboard.clearData();

      // Focus the context back on the trigger element (blur the Flash element)
      if (element && element !== _safeActiveElement() && element.focus) {
        element.focus();
      }
      break;

    case "_mouseover":
      // Set this as the new currently active element
      ZeroClipboard.focus(element);

      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        if (
          element &&
          element !== event.relatedTarget &&
          !_containedBy(event.relatedTarget, element)
        ) {
          _fireMouseEvent(
            _extend({}, event, {
              type: "mouseenter",
              bubbles: false,
              cancelable: false
            })
          );
        }

        _fireMouseEvent(
          _extend({}, event, {
            type: "mouseover"
          })
        );
      }
      break;

    case "_mouseout":
      // If the mouse is moving to any other element, deactivate and...
      ZeroClipboard.blur();

      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        if (
          element &&
          element !== event.relatedTarget &&
          !_containedBy(event.relatedTarget, element)
        ) {
          _fireMouseEvent(
            _extend({}, event, {
              type: "mouseleave",
              bubbles: false,
              cancelable: false
            })
          );
        }

        _fireMouseEvent(
          _extend({}, event, {
            type: "mouseout"
          })
        );
      }
      break;

    case "_mousedown":
      _addClass(element, _globalConfig.activeClass);

      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        _fireMouseEvent(_extend({}, event, { type: event.type.slice(1) }));
      }
      break;

    case "_mouseup":
      _removeClass(element, _globalConfig.activeClass);

      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        _fireMouseEvent(_extend({}, event, { type: event.type.slice(1) }));
      }
      break;

    case "_click":
      _copyTarget = null;

      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        _fireMouseEvent(_extend({}, event, { type: event.type.slice(1) }));
      }
      break;

    case "_mousemove":
      if (_globalConfig.bubbleEvents === true && sourceIsSwf) {
        _fireMouseEvent(_extend({}, event, { type: event.type.slice(1) }));
      }
      break;
  } // end `switch`

  // Return a flag to indicate that this event should stop being processed
  if (/^_(?:click|mouse(?:over|out|down|up|move))$/.test(event.type)) {
    return true;
  }
};


/**
 * Check an "aftercopy" event for clipboard errors and emit a corresponding "error" event.
 * @private
 */
var _queueEmitClipboardErrors = function(aftercopyEvent) {
  if (aftercopyEvent.errors && aftercopyEvent.errors.length > 0) {
    var errorEvent = _deepCopy(aftercopyEvent);
    _extend(errorEvent, {
      type: "error",
      name: "clipboard-error"
    });
    delete errorEvent.success;

    // Delay emitting this until AFTER the "aftercopy" event has finished emitting
    _setTimeout(function() {
      ZeroClipboard.emit(errorEvent);
    }, 0);
  }
};


/**
 * Dispatch a synthetic MouseEvent.
 *
 * @returns `undefined`
 * @private
 */
var _fireMouseEvent = function(event) {
  if (!(event && typeof event.type === "string" && event)) {
    return;
  }

  var e,
      target = event.target || null,
      doc = (target && target.ownerDocument) || _document,
      defaults = {
        view: doc.defaultView || _window,
        canBubble: true,
        cancelable: true,
        detail: event.type === "click" ? 1 : 0,
        button:
          typeof event.which === "number" ?
          (event.which - 1) :
          (
            typeof event.button === "number" ?
            event.button :
            (doc.createEvent ? 0 : 1)
          )
      },
      // Update the Event data to its final state
      args = _extend(defaults, event);

  if (!target) {
    return;
  }

  // Create and fire the MouseEvent
  if (doc.createEvent && target.dispatchEvent) {
    args = [
      args.type, args.canBubble, args.cancelable, args.view, args.detail,
      args.screenX, args.screenY, args.clientX, args.clientY,
      args.ctrlKey, args.altKey, args.shiftKey, args.metaKey,
      args.button, args.relatedTarget
    ];
    e = doc.createEvent("MouseEvents");
    if (e.initMouseEvent) {
      e.initMouseEvent.apply(e, args);
      e._source = "js";
      target.dispatchEvent(e);
    }
  }
};


/**
 * Continuously poll the DOM until either:
 *  (a) the fallback content becomes visible, or
 *  (b) we receive an event from SWF (handled elsewhere)
 *
 * IMPORTANT:
 * This is NOT a necessary check but it can result in significantly faster
 * detection of bad `swfPath` configuration and/or network/server issues [in
 * supported browsers] than waiting for the entire `flashLoadTimeout` duration
 * to elapse before detecting that the SWF cannot be loaded. The detection
 * duration can be anywhere from 10-30 times faster [in supported browsers] by
 * using this approach.
 *
 * @returns `undefined`
 * @private
 */
var _watchForSwfFallbackContent = function() {
  var maxWait = _globalConfig.flashLoadTimeout;
  if (typeof maxWait === "number" && maxWait >= 0) {
    var pollWait = Math.min(1000, (maxWait / 10));
    var fallbackContentId = _globalConfig.swfObjectId + "_fallbackContent";
    _swfFallbackCheckInterval = _setInterval(function() {
      // If the fallback content is showing, the SWF failed to load
      // NOTE: Only works in Firefox and IE10 (specifically; not IE9, not IE11... o_O)
      var el = _document.getElementById(fallbackContentId);
      if (_isElementVisible(el)) {
        // Remove the polling checks immediately
        _clearTimeoutsAndPolling();

        // Do NOT count a missing SWF as a Flash deactivation
        _flashState.deactivated = null;

        ZeroClipboard.emit({ type: "error", name: "swf-not-found" });
      }
    }, pollWait);
  }
};


/**
 * Create the HTML bridge element to embed the Flash object into.
 * @private
 */
var _createHtmlBridge = function() {
  var container = _document.createElement("div");
  container.id = _globalConfig.containerId;
  container.className = _globalConfig.containerClass;
  container.style.position = "absolute";
  container.style.left = "0px";
  container.style.top = "-9999px";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.zIndex = "" + _getSafeZIndex(_globalConfig.zIndex);
  return container;
};


/**
 * Get the HTML element container that wraps the Flash bridge object/element.
 * @private
 */
var _getHtmlBridge = function(flashBridge) {
  var htmlBridge = flashBridge && flashBridge.parentNode;
  while (htmlBridge && htmlBridge.nodeName === "OBJECT" && htmlBridge.parentNode) {
    htmlBridge = htmlBridge.parentNode;
  }
  return htmlBridge || null;
};


/**
 * Create the SWF object.
 *
 * @returns The SWF object reference.
 * @private
 */
var _embedSwf = function() {
  /*jshint maxstatements:26 */

  var len,
      flashBridge = _flashState.bridge,
      container = _getHtmlBridge(flashBridge);

  if (!flashBridge) {
    // Set `allowScriptAccess`/`allowNetworking` based on `trustedDomains` and `window.location.host` vs. `swfPath`
    var allowScriptAccess = _determineScriptAccess(_window.location.host, _globalConfig);
    var allowNetworking = allowScriptAccess === "never" ? "none" : "all";

    // Prepare the FlashVars and cache-busting query param
    var flashvars = _vars(_extend({ jsVersion: ZeroClipboard.version }, _globalConfig));
    var swfUrl = _globalConfig.swfPath + _cacheBust(_globalConfig.swfPath, _globalConfig);

    // Create the outer container
    container = _createHtmlBridge();

    // Create a to-be-replaced child node
    var divToBeReplaced = _document.createElement("div");
    container.appendChild(divToBeReplaced);

    // Add this outer container (and its to-be-replaced child node) to the DOM in advance in order
    // to avoid Flash quirks in various browsers, e.g. https://github.com/zeroclipboard/zeroclipboard/issues/204
    _document.body.appendChild(container);

    // Create the actual Flash object's shell
    var tmpDiv = _document.createElement("div");
    // The object element plus its movie source URL both MUST be created together.
    // Other attributes and child nodes can techncially be added afterward.
    // Hybrid of Flash Satay markup is from Ambience:
    //  - Flash Satay version:  http://alistapart.com/article/flashsatay
    //  - Ambience version:     http://www.ambience.sk/flash-valid.htm
    var usingActiveX = _flashState.pluginType === "activex";
    /*jshint quotmark:single */
    tmpDiv.innerHTML =
      '<object id="' + _globalConfig.swfObjectId + '" name="' + _globalConfig.swfObjectId + '" ' +
        'width="100%" height="100%" ' +
        (usingActiveX ? 'classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"' : 'type="application/x-shockwave-flash" data="' + swfUrl + '"') +
      '>' +
        (usingActiveX ? '<param name="movie" value="' + swfUrl + '"/>' : '') +
        '<param name="allowScriptAccess" value="' + allowScriptAccess + '"/>' +
        '<param name="allowNetworking" value="' + allowNetworking + '"/>' +
        '<param name="menu" value="false"/>' +
        '<param name="wmode" value="transparent"/>' +
        '<param name="flashvars" value="' + flashvars + '"/>' +
        '<div id="' + _globalConfig.swfObjectId + '_fallbackContent">&nbsp;</div>' +
      '</object>';
    /*jshint quotmark:double */
    flashBridge = tmpDiv.firstChild;
    tmpDiv = null;

    // Store a reference to the `ZeroClipboard` object as a DOM property
    // on the ZeroClipboard-owned "object" element. This will help us
    // easily avoid issues with AMD/CommonJS loaders that don't have
    // a global `ZeroClipboard` reliably available.
    _unwrap(flashBridge).ZeroClipboard = ZeroClipboard;

    // NOTE: Using `replaceChild` is very important!
    // - https://github.com/swfobject/swfobject/blob/562fe358216edbb36445aa62f817c1a56252950c/swfobject/src/swfobject.js
    // - http://pipwerks.com/2011/05/30/using-the-object-element-to-dynamically-embed-flash-swfs-in-internet-explorer/
    container.replaceChild(flashBridge, divToBeReplaced);

    // Watch the DOM for the fallback content to become visible, indicating a SWF load failure
    _watchForSwfFallbackContent();
  }

  if (!flashBridge) {
    flashBridge = _document[_globalConfig.swfObjectId];
    if (flashBridge && (len = flashBridge.length)) {
      flashBridge = flashBridge[len - 1];
    }
    if (!flashBridge && container) {
      flashBridge = container.firstChild;
    }
  }

  _flashState.bridge = flashBridge || null;

  return flashBridge;
};


/**
 * Destroy the SWF object.
 * @private
 */
var _unembedSwf = function() {
  // Remove the Flash bridge
  var flashBridge = _flashState.bridge;
  if (flashBridge) {
    var htmlBridge = _getHtmlBridge(flashBridge);
    if (htmlBridge) {
      // Some extra caution is necessary to prevent Flash from causing memory leaks in oldIE
      // NOTE: Removing the SWF in IE may not be completed synchronously
      if (_flashState.pluginType === "activex" && "readyState" in flashBridge) {
        flashBridge.style.display = "none";
        (function removeSwfFromIE() {
          if (flashBridge.readyState === 4) {
            // This step prevents memory leaks in oldIE
            for (var prop in flashBridge) {
              if (typeof flashBridge[prop] === "function") {
                flashBridge[prop] = null;
              }
            }
            if (flashBridge.parentNode) {
              flashBridge.parentNode.removeChild(flashBridge);
            }
            if (htmlBridge.parentNode) {
              htmlBridge.parentNode.removeChild(htmlBridge);
            }
          }
          else {
            _setTimeout(removeSwfFromIE, 10);
          }
        })();
      }
      else {
        if (flashBridge.parentNode) {
          flashBridge.parentNode.removeChild(flashBridge);
        }
        if (htmlBridge.parentNode) {
          htmlBridge.parentNode.removeChild(htmlBridge);
        }
      }
    }

    // Remove the availability and SWF network error checking timeout/interval, as they could
    // inappropriately trigger events like "flash-deactivated" and "swf-not-found" after destroy.
    _clearTimeoutsAndPolling();

    _flashState.ready = null;
    _flashState.bridge = null;

    // Reset the `deactivated` status in case the user wants to "try again", i.e.
    // after receiving an `error[name="flash-overdue"]` event
    _flashState.deactivated = null;

    // Reset the `insecure` status in case the user reconfigures the `swfPath`
    _flashState.insecure = null;

    // Don't keep track of the SWF's ZC library version number
    // NOTE: The use of `undefined` here instead of `null` is important!
    _zcSwfVersion = undefined;
  }
};


/**
 * Map the data format names of the "clipData" to Flash-friendly names.
 *
 * @returns A new transformed object.
 * @private
 */
var _mapClipDataToFlash = function(clipData) {
  var newClipData = {},
      formatMap = {};
  if (!(typeof clipData === "object" && clipData)) {
    return;
  }

  for (var dataFormat in clipData) {
    if (dataFormat && _hasOwn.call(clipData, dataFormat) && typeof clipData[dataFormat] === "string" && clipData[dataFormat]) {
      // Standardize the allowed clipboard segment names to reduce complexity on the Flash side
      switch (dataFormat.toLowerCase()) {
        case "text/plain":
        case "text":
        case "air:text":
        case "flash:text":
          newClipData.text = clipData[dataFormat];
          formatMap.text = dataFormat;
          break;
        case "text/html":
        case "html":
        case "air:html":
        case "flash:html":
          newClipData.html = clipData[dataFormat];
          formatMap.html = dataFormat;
          break;
        case "application/rtf":
        case "text/rtf":
        case "rtf":
        case "richtext":
        case "air:rtf":
        case "flash:rtf":
          newClipData.rtf = clipData[dataFormat];
          formatMap.rtf = dataFormat;
          break;
        default:
          // Just ignore it: the Flash clipboard cannot handle any other formats
          break;
      }
    }
  }
  return {
    data: newClipData,
    formatMap: formatMap
  };
};


/**
 * Map the data format names from Flash-friendly names back to their original "clipData" names (via a format mapping).
 *
 * @returns A new transformed object.
 * @private
 */
var _mapClipResultsFromFlash = function(clipResults, formatMap) {
  if (!(typeof clipResults === "object" && clipResults && typeof formatMap === "object" && formatMap)) {
    return clipResults;
  }

  var newResults = {};

  for (var prop in clipResults) {
    if (_hasOwn.call(clipResults, prop)) {
      if (prop === "errors") {
        newResults[prop] = clipResults[prop] ? clipResults[prop].slice() : [];
        for (var i = 0, len = newResults[prop].length; i < len; i++) {
          newResults[prop][i].format = formatMap[newResults[prop][i].format];
        }
      }
      else if (prop !== "success" && prop !== "data") {
        newResults[prop] = clipResults[prop];
      }
      else {
        newResults[prop] = {};

        // Standardize the allowed clipboard segment names to reduce complexity on the Flash side
        var tmpHash = clipResults[prop];
        for (var dataFormat in tmpHash) {
          if (dataFormat && _hasOwn.call(tmpHash, dataFormat) && _hasOwn.call(formatMap, dataFormat)) {
            newResults[prop][formatMap[dataFormat]] = tmpHash[dataFormat];
          }
        }
      }
    }
  }
  return newResults;
};


/**
 * Will look at a path, and will create a "?noCache={time}" or "&noCache={time}"
 * query param string to return. Does NOT append that string to the original path.
 * This is useful because ExternalInterface often breaks when a Flash SWF is cached.
 *
 * @returns The `noCache` query param with necessary "?"/"&" prefix.
 * @private
 */
var _cacheBust = function(path, options) {
  var cacheBust = options == null || (options && options.cacheBust === true);
  if (cacheBust) {
    return (path.indexOf("?") === -1 ? "?" : "&") + "noCache=" + _now();
  }
  else {
    return "";
  }
};


/**
 * Creates a query string for the FlashVars param.
 * Does NOT include the cache-busting query param.
 *
 * @returns FlashVars query string
 * @private
 */
var _vars = function(options) {
  var i, len, domain, domains,
      str = "",
      trustedOriginsExpanded = [];

  if (options.trustedDomains) {
    if (typeof options.trustedDomains === "string") {
      domains = [options.trustedDomains];
    }
    else if (typeof options.trustedDomains === "object" && "length" in options.trustedDomains) {
      domains = options.trustedDomains;
    }
  }
  if (domains && domains.length) {
    for (i = 0, len = domains.length; i < len; i++) {
      if (_hasOwn.call(domains, i) && domains[i] && typeof domains[i] === "string") {
        domain = _extractDomain(domains[i]);

        if (!domain) {
          continue;
        }

        // If we encounter a wildcard, ignore everything else as they are irrelevant
        if (domain === "*") {
          trustedOriginsExpanded.length = 0;
          trustedOriginsExpanded.push(domain);
          break;
        }

        // Add the domain, relative protocol + domain, and absolute protocol + domain ("origin")
        // because Flash Player seems to handle these inconsistently (perhaps in different versions)
        trustedOriginsExpanded.push.apply(
          trustedOriginsExpanded,
          [
            domain,
            "//" + domain,
            _window.location.protocol + "//" + domain
          ]
        );
      }
    }
  }

  if (trustedOriginsExpanded.length) {
    str += "trustedOrigins=" + _encodeURIComponent(trustedOriginsExpanded.join(","));
  }

  if (options.forceEnhancedClipboard === true) {
    str += (str ? "&" : "") + "forceEnhancedClipboard=true";
  }

  if (typeof options.swfObjectId === "string" && options.swfObjectId) {
    str += (str ? "&" : "") + "swfObjectId=" + _encodeURIComponent(options.swfObjectId);
  }

  if (typeof options.jsVersion === "string" && options.jsVersion) {
    str += (str ? "&" : "") + "jsVersion=" + _encodeURIComponent(options.jsVersion);
  }

  return str;
};


/**
 * Extract the domain (e.g. "github.com") from an origin (e.g. "https://github.com") or
 * URL (e.g. "https://github.com/zeroclipboard/zeroclipboard/").
 *
 * @returns the domain
 * @private
 */
var _extractDomain = function(originOrUrl) {
  if (originOrUrl == null || originOrUrl === "") {
    return null;
  }

  // Trim
  originOrUrl = originOrUrl.replace(/^\s+|\s+$/g, "");
  if (originOrUrl === "") {
    return null;
  }

  // Strip the protocol, if any was provided
  var protocolIndex = originOrUrl.indexOf("//");
  originOrUrl = protocolIndex === -1 ? originOrUrl : originOrUrl.slice(protocolIndex + 2);

  // Strip the path, if any was provided
  var pathIndex = originOrUrl.indexOf("/");
  originOrUrl = pathIndex === -1 ? originOrUrl : protocolIndex === -1 || pathIndex === 0 ? null : originOrUrl.slice(0, pathIndex);

  if (originOrUrl && originOrUrl.slice(-4).toLowerCase() === ".swf") {
    return null;
  }
  return originOrUrl || null;
};


/**
 * Set `allowScriptAccess` based on `trustedDomains` and `window.location.host` vs. `swfPath`.
 *
 * @returns The appropriate script access level.
 * @private
 */
var _determineScriptAccess = (function() {
  var _extractAllDomains = function(origins) {
    var i, len, tmp,
        resultsArray = [];
    if (typeof origins === "string") {
      origins = [origins];
    }
    if (!(typeof origins === "object" && origins && typeof origins.length === "number")) {
      return resultsArray;
    }
    for (i = 0, len = origins.length; i < len; i++) {
      if (_hasOwn.call(origins, i) && (tmp = _extractDomain(origins[i]))) {
        if (tmp === "*") {
          resultsArray.length = 0;
          resultsArray.push("*");
          break;
        }
        if (resultsArray.indexOf(tmp) === -1) {
          resultsArray.push(tmp);
        }
      }
    }
    return resultsArray;
  };

  return function(currentDomain, configOptions) {
    // Get SWF domain
    var swfDomain = _extractDomain(configOptions.swfPath);
    if (swfDomain === null) {
      swfDomain = currentDomain;
    }
    // Get all trusted domains
    var trustedDomains = _extractAllDomains(configOptions.trustedDomains);

    var len = trustedDomains.length;
    if (len > 0) {
      if (len === 1 && trustedDomains[0] === "*") {
        return "always";
      }
      if (trustedDomains.indexOf(currentDomain) !== -1) {
        if (len === 1 && currentDomain === swfDomain) {
          return "sameDomain";
        }
        return "always";
      }
    }
    return "never";
  };
})();


/**
 * Get the currently active/focused DOM element.
 *
 * @returns the currently active/focused element, or `null`
 * @private
 */
var _safeActiveElement = function() {
  try {
    return _document.activeElement;
  }
  catch (err) {
    return null;
  }
};


/**
 * Add a class to an element, if it doesn't already have it.
 *
 * @returns The element, with its new class added.
 * @private
 */
var _addClass = function(element, value) {
  var c, cl, className,
      classNames = [];

  if (typeof value === "string" && value) {
    classNames = value.split(/\s+/);
  }

  if (element && element.nodeType === 1 && classNames.length > 0) {
    className = (" " + (element.className || "") + " ").replace(/[\t\r\n\f]/g, " ");
    for (c = 0, cl = classNames.length; c < cl; c++) {
      if (className.indexOf(" " + classNames[c] + " ") === -1) {
        className += classNames[c] + " ";
      }
    }
    // trim
    className = className.replace(/^\s+|\s+$/g, "");

    // Only assign if different to avoid unneeded rendering.
    if (className !== element.className) {
      element.className = className;
    }
  }

  return element;
};


/**
 * Remove a class from an element, if it has it.
 *
 * @returns The element, with its class removed.
 * @private
 */
var _removeClass = function(element, value) {
  var c, cl, className,
      classNames = [];

  if (typeof value === "string" && value) {
    classNames = value.split(/\s+/);
  }

  if (element && element.nodeType === 1 && classNames.length > 0) {
    if (element.className) {
      className = (" " + element.className + " ").replace(/[\t\r\n\f]/g, " ");
      for (c = 0, cl = classNames.length; c < cl; c++) {
        className = className.replace(" " + classNames[c] + " ", " ");
      }
      // trim
      className = className.replace(/^\s+|\s+$/g, "");

      // Only assign if different to avoid unneeded rendering.
      if (className !== element.className) {
        element.className = className;
      }
    }
  }

  return element;
};


/**
 * Attempt to interpret the element's CSS styling. If `prop` is `"cursor"`,
 * then we assume that it should be a hand ("pointer") cursor if the element
 * is an anchor element ("a" tag).
 *
 * @returns The computed style property.
 * @private
 */
var _getStyle = function(el, prop) {
  var value = _getComputedStyle(el, null).getPropertyValue(prop);
  if (prop === "cursor") {
    if (!value || value === "auto") {
      if (el.nodeName === "A") {
        return "pointer";
      }
    }
  }

  return value;
};


/**
 * Get the absolutely positioned coordinates of a DOM element.
 *
 * @returns Object containing the element's position, width, and height.
 * @private
 */
var _getElementPosition = function(el) {
  var pos = {
    left: 0,
    top: 0,
    width: 0,
    height: 0
  };

  // Use getBoundingClientRect where available (almost everywhere).
  // See: http://www.quirksmode.org/dom/w3c_cssom.html
  if (el.getBoundingClientRect) {
    // Compute left / top offset (works for `position:fixed`, too!)
    var elRect = el.getBoundingClientRect();

    // Get the document's scroll offsets
    var pageXOffset = _window.pageXOffset;
    var pageYOffset = _window.pageYOffset;

    // `clientLeft`/`clientTop` are to fix IE's 2px offset in standards mode
    var leftBorderWidth = _document.documentElement.clientLeft || 0;
    var topBorderWidth = _document.documentElement.clientTop || 0;

    // Compensate for the `body` offset relative to the `html` root
    // This is critical for when the `body` element's CSS includes `position:relative`
    var leftBodyOffset = 0;
    var topBodyOffset = 0;
    if (_getStyle(_document.body, "position") === "relative") {
      var bodyRect = _document.body.getBoundingClientRect();
      var htmlRect = _document.documentElement.getBoundingClientRect();
      leftBodyOffset = (bodyRect.left - htmlRect.left) || 0;
      topBodyOffset = (bodyRect.top - htmlRect.top) || 0;
    }

    pos.left = elRect.left + pageXOffset - leftBorderWidth - leftBodyOffset;
    pos.top = elRect.top + pageYOffset - topBorderWidth - topBodyOffset;
    pos.width = "width" in elRect ? elRect.width : elRect.right - elRect.left;
    pos.height = "height" in elRect ? elRect.height : elRect.bottom - elRect.top;
  }

  return pos;
};


/**
 * Determine is an element is visible somewhere within the document (page).
 *
 * @returns Boolean
 * @private
 */
var _isElementVisible = function(el) {
  if (!el) {
    return false;
  }

  var styles = _getComputedStyle(el, null);
  if (!styles) {
    return false;
  }

  var hasCssHeight = _parseFloat(styles.height) > 0;
  var hasCssWidth = _parseFloat(styles.width) > 0;
  var hasCssTop = _parseFloat(styles.top) >= 0;
  var hasCssLeft = _parseFloat(styles.left) >= 0;
  var cssKnows = hasCssHeight && hasCssWidth && hasCssTop && hasCssLeft;
  var rect = cssKnows ? null : _getElementPosition(el);

  var isVisible = (
    styles.display !== "none" &&
    styles.visibility !== "collapse" &&
    (
      cssKnows ||
      (
        !!rect &&
        (hasCssHeight || rect.height > 0) &&
        (hasCssWidth || rect.width > 0) &&
        (hasCssTop || rect.top >= 0) &&
        (hasCssLeft || rect.left >= 0)
      )
    )
  );
  return isVisible;
};


/**
 * Clear all existing timeouts and interval polling delegates.
 *
 * @returns `undefined`
 * @private
 */
var _clearTimeoutsAndPolling = function() {
  // Remove the availability checking timeout
  _clearTimeout(_flashCheckTimeout);
  _flashCheckTimeout = 0;

  // Remove the SWF network error polling
  _clearInterval(_swfFallbackCheckInterval);
  _swfFallbackCheckInterval = 0;
};


/**
 * Reposition the Flash object to cover the currently activated element.
 *
 * @returns `undefined`
 * @private
 */
var _reposition = function() {
  var htmlBridge;
  // If there is no `_currentElement`, skip it
  if (_currentElement && (htmlBridge = _getHtmlBridge(_flashState.bridge))) {
    var pos = _getElementPosition(_currentElement);
    _extend(htmlBridge.style, {
      width: pos.width + "px",
      height: pos.height + "px",
      top: pos.top + "px",
      left: pos.left + "px",
      zIndex: "" + _getSafeZIndex(_globalConfig.zIndex)
    });
  }
};


/**
 * Sends a signal to the Flash object to display the hand cursor if `true`.
 *
 * @returns `undefined`
 * @private
 */
var _setHandCursor = function(enabled) {
  if (_flashState.ready === true) {
    if (_flashState.bridge && typeof _flashState.bridge.setHandCursor === "function") {
      _flashState.bridge.setHandCursor(enabled);
    }
    else {
      _flashState.ready = false;
    }
  }
};


/**
 * Get a safe value for `zIndex`
 *
 * @returns an integer, or "auto"
 * @private
 */
var _getSafeZIndex = function(val) {
  if (/^(?:auto|inherit)$/.test(val)) {
    return val;
  }

  var zIndex;
  if (typeof val === "number" && !_isNaN(val)) {
    zIndex = val;
  }
  else if (typeof val === "string") {
    zIndex = _getSafeZIndex(_parseInt(val, 10));
  }
  return typeof zIndex === "number" ? zIndex : "auto";
};


/**
 * Ensure OS-compliant line endings, i.e. "\r\n" on Windows, "\n" elsewhere
 *
 * @returns string
 * @private
 */
var _fixLineEndings = function(content) {
  var replaceRegex = /(\r\n|\r|\n)/g;

  if (typeof content === "string" && _globalConfig.fixLineEndings === true) {
    if (_isWindows()) {
      if (/((^|[^\r])\n|\r([^\n]|$))/.test(content)) {
        content = content.replace(replaceRegex, "\r\n");
      }
    }
    else if (/\r/.test(content)) {
      content = content.replace(replaceRegex, "\n");
    }
  }
  return content;
};


/**
 * Attempt to detect if ZeroClipboard is executing inside of a sandboxed iframe.
 * If it is, Flash Player cannot be used, so ZeroClipboard is dead in the water.
 *
 * @see {@link http://lists.w3.org/Archives/Public/public-whatwg-archive/2014Dec/0002.html}
 * @see {@link https://github.com/zeroclipboard/zeroclipboard/issues/511}
 * @see {@link http://zeroclipboard.org/test-iframes.html}
 *
 * @returns `true` (is sandboxed), `false` (is not sandboxed), or `null` (uncertain)
 * @private
 */
var _detectSandbox = function(doNotReassessFlashSupport) {
  var effectiveScriptOrigin, frame, frameError,
      previousState = _flashState.sandboxed,
      isSandboxed = null;

  doNotReassessFlashSupport = doNotReassessFlashSupport === true;

  // If the page is not framed, bail out immediately
  if (_pageIsFramed === false) {
    isSandboxed = false;
  }
  else {
    try {
      frame = window.frameElement || null;
    }
    catch (e) {
      frameError = { name: e.name, message: e.message };
    }

    if (frame && frame.nodeType === 1 && frame.nodeName === "IFRAME") {
      try {
        isSandboxed = frame.hasAttribute("sandbox");
      }
      catch (e) {
        isSandboxed = null;
      }
    }
    else {
      try {
        effectiveScriptOrigin = document.domain || null;
      }
      catch (e) {
        effectiveScriptOrigin = null;
      }

      if (
        effectiveScriptOrigin === null ||
        (
          frameError &&
          frameError.name === "SecurityError" &&
          /(^|[\s\(\[@])sandbox(es|ed|ing|[\s\.,!\)\]@]|$)/.test(frameError.message.toLowerCase())
        )
      ) {
        isSandboxed = true;
      }
    }
  }

  // `true` == ZeroClipboard definitely will NOT work
  // `false` == ZeroClipboard should work if all Flash configurations are right
  // `null` == ZeroClipboard may or may not work, so assume it can and attempt
  _flashState.sandboxed = isSandboxed;

  // If the state of sandboxing has changed, also re-detect Flash support
  if (previousState !== isSandboxed && !doNotReassessFlashSupport) {
    _detectFlashSupport(_ActiveXObject);
  }

  return isSandboxed;
};


/**
 * Detect the Flash Player status, version, and plugin type.
 *
 * @see {@link https://code.google.com/p/doctype-mirror/wiki/ArticleDetectFlash#The_code}
 * @see {@link http://stackoverflow.com/questions/12866060/detecting-pepper-ppapi-flash-with-javascript}
 *
 * @returns `undefined`
 * @private
 */
var _detectFlashSupport = function(ActiveXObject) {
  var plugin, ax, mimeType,
      hasFlash = false,
      isActiveX = false,
      isPPAPI = false,
      flashVersion = "";

  /**
   * Derived from Apple's suggested sniffer.
   * @param {String} desc e.g. "Shockwave Flash 7.0 r61"
   * @returns {String} "7.0.61"
   * @private
   */
  function parseFlashVersion(desc) {
    var matches = desc.match(/[\d]+/g);
    matches.length = 3; // To standardize IE vs FF
    return matches.join(".");
  }

  function isPepperFlash(flashPlayerFileName) {
    return !!flashPlayerFileName &&
      (flashPlayerFileName = flashPlayerFileName.toLowerCase()) &&
      (
        /^(pepflashplayer\.dll|libpepflashplayer\.so|pepperflashplayer\.plugin)$/.test(flashPlayerFileName) ||
        flashPlayerFileName.slice(-13) === "chrome.plugin"
      );
  }

  function inspectPlugin(plugin) {
    if (plugin) {
      hasFlash = true;
      if (plugin.version) {
        flashVersion = parseFlashVersion(plugin.version);
      }
      if (!flashVersion && plugin.description) {
        flashVersion = parseFlashVersion(plugin.description);
      }
      if (plugin.filename) {
        isPPAPI = isPepperFlash(plugin.filename);
      }
    }
  }

  if (_navigator.plugins && _navigator.plugins.length) {
    plugin = _navigator.plugins["Shockwave Flash"];
    inspectPlugin(plugin);

    if (_navigator.plugins["Shockwave Flash 2.0"]) {
      hasFlash = true;
      flashVersion = "2.0.0.11";
    }
  }
  else if (_navigator.mimeTypes && _navigator.mimeTypes.length) {
    mimeType = _navigator.mimeTypes["application/x-shockwave-flash"];
    plugin = mimeType && mimeType.enabledPlugin;
    inspectPlugin(plugin);
  }
  else if (typeof ActiveXObject !== "undefined") {
    //
    // Using IE < 11
    //
    isActiveX = true;

    try {
      // Try 7 first, since we know we can use GetVariable with it
      ax = new ActiveXObject("ShockwaveFlash.ShockwaveFlash.7");
      hasFlash = true;
      flashVersion = parseFlashVersion(ax.GetVariable("$version"));
    }
    catch (e1) {
      // Try 6 next, some versions are known to crash with GetVariable calls
      try {
        ax = new ActiveXObject("ShockwaveFlash.ShockwaveFlash.6");
        hasFlash = true;
        flashVersion = "6.0.21"; // First public version of Flash 6
      }
      catch (e2) {
        try {
          // Try the default ActiveX
          ax = new ActiveXObject("ShockwaveFlash.ShockwaveFlash");
          hasFlash = true;
          flashVersion = parseFlashVersion(ax.GetVariable("$version"));
        }
        catch (e3) {
          // No flash
          isActiveX = false;
        }
      }
    }
  }

  _flashState.disabled = hasFlash !== true;
  _flashState.outdated = flashVersion && (_parseFloat(flashVersion) < _parseFloat(_minimumFlashVersion));
  _flashState.version = flashVersion || "0.0.0";
  _flashState.pluginType = isPPAPI ? "pepper" : (isActiveX ? "activex" : (hasFlash ? "netscape" : "unknown"));
};


/**
 * Invoke the Flash detection algorithms immediately upon inclusion so we're not waiting later.
 */
_detectFlashSupport(_ActiveXObject);
/**
 * Always assess the `sandboxed` state of the page at important Flash-related moments.
 */
_detectSandbox(true);
