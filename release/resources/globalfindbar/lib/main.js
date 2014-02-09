const {Cc, Ci, Cu, components} = require('chrome');
const selfId = 'jid0-GlobalFindBar';
const selfTitle = 'globalfindbar';
const selfPath = 'resource://' + selfId + '-at-jetpack/' + selfTitle + '/'; //NOTE - this must be gotten from "Properties" panel //example: selfPath + 'data/style/global.css'
const prefPrefix = 'extensions.' + selfId + '@jetpack.'; //for the pref stuff //jetpack stuff has @jetpack appended //note must have period at end because when do branch.set if no period then there is no period between prefix and the set name, likewise for get

Cu.import("resource://gre/modules/Services.jsm");
const wm = Services.wm; //Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
const as = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
const obs = Services.obs; //Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
const ps = Services.prefs; //Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
const fm = Services.focus;
const sss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
const ios = Services.io; //Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);

var fbStateArr = []; //holds {win: win, domain: domain, val: findbar_value, hid: findbar_hidden}

var mObservers = []; //a new mutation observer per window //holds [{win: window, obs: observer}
var mObserverConfig = {attributes: true};

var programaticallyTogglingHid = false;
var programaticallyChangingVal = false;

var cTab = null; //on tabsel if cTab not null then we dispatch tabSeld event to that tab then after that we set cTab to current tab, a
var cTabVal = null;

var observers = {
    /*
    inlineOptsHid: {
        observe:    function(aSubject, aTopic, aData) {
                        //##Cu.reportError('incoming inlineOptsHid: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData);
                        if (aTopic == 'addon-options-hidden' && aData == selfId + '@jetpack') {
                            addonMgrXulWin = null; //trial as of 112713
                        }
                    },
        reg:    function() {
                obs.addObserver(observers.inlineOptsHid, 'addon-options-hidden', false);
            },
        unreg:    function() {
                obs.removeObserver(observers.inlineOptsHid, 'addon-options-hidden');
            }
    }
    */
};

////start pref listener stuff
//edit prefs objection ONLY
//all pref paths are preceded with: 'extensions.' + selfTitle + '.
var prefs = { //each key here must match the exact name the pref is saved in the about:config database (without the prefix)
    /*
    hotkey_hopTabCurWin: {
        default: '{"keycode":19, "action":"upped", "mods":[]}',
        value: null, //the current value, initialize on addon statup NEVER SET VALUE PROGRAMATICALLY, IF NEED TO SET VALUE THEN USE THE prefs[name].setval function, this is because onChange callback I use .value to figure out oldVal. setval func is like setting the pref in about:config, if json pref then must supply object
        type: 'Char', //call later on by going ps.['get' + pefs.blah.type + 'Pref'](prefs.blah.value) AND OR ps.['set' + pefs.blah.type + 'Pref'](prefs.blah.value)
        json: null, //if json is true then JSON.parse'ed when value is set, it should hold the non-parsed version of value (this saves the callback from running a JSON.stringify when figuring out oldValue
        onChange: hotkeyPref_onChange//this is additonal stuff you want to happen when pref observer finds it changes, by default on observe prefs.blah.value is matched to the new value, THIS SHOULD ALSO EXEC ON INIT(/ADDON STARTUP)        //so in all observers, whenever a pref is changed, it will set the prefs.blah.value to new value. onPreChange fires before prefs.blah.value is matched to new val        //onChange fires after value is matched to new val
    },
    */
	tabScope: {
		default: 0, //0 = all tabs, 1 = per tab domain
		value: null,
		type: 'Int'
	},
	winScope: {
		default: 0, //0 = per window, 1 = per profile so all windows
		value: null,
		type: 'Int'
	},
	restore_old_style: {
		default: false,
		value: null,
		type: 'Bool',
		onChange: function(oldVal, newVal) {
			restore_old_style(newVal);
		}
	},
	findbarFocus: {
		default: 1, //on tabselect findbar: 0 = always gets focus, 1 = focus only if currently focused element is not text, 2 = never focus
		value: null,
		type: 'Int'
	}
};

function prefSetval(name, updateTo) {
	if ('json' in prefs[name]) {
		//updateTo must be an object
		if (Object.prototype.toString.call(updateTo) != '[object Object]') {
			//##Cu.reportError('EXCEPTION: prefs[name] is json but updateTo supplied is not an object');
			return;
		}

		var stringify = JSON.stringify(updateTo); //uneval(updateTo);
		myPrefListener._branch['set' + prefs[name].type + 'Pref'](name, stringify);
		//prefs[name].value = {};
		//for (var p in updateTo) {
		//    prefs[name].value[p] = updateTo[p];
		//}
	} else {
		//prefs[name].value = updateTo;
		myPrefListener._branch['set' + prefs[name].type + 'Pref'](name, updateTo);
	}
}
///pref listener generic stuff NO NEED TO EDIT
/**
 * @constructor
 *
 * @param {string} branch_name
 * @param {Function} callback must have the following arguments:
 *   branch, pref_leaf_name
 */
function PrefListener(branch_name, callback) {
	// Keeping a reference to the observed preference branch or it will get
	// garbage collected.
	this._branch = ps.getBranch(branch_name);
	this._defaultBranch = ps.getDefaultBranch(branch_name);
	this._branch.QueryInterface(Ci.nsIPrefBranch2);
	this._callback = callback;
}

PrefListener.prototype.observe = function (subject, topic, data) {
	if (topic == 'nsPref:changed')
		this._callback(this._branch, data);
};

/**
 * @param {boolean=} trigger if true triggers the registered function
 *   on registration, that is, when this method is called.
 */
PrefListener.prototype.register = function (trigger) {
	//adds the observer to all prefs and gives it the seval function
	this._branch.addObserver('', this, false);
	for (var p in prefs) {
		prefs[p].setval = prefSetval;
	}
	if (trigger) {
		this.forceCallbacks();
	}
};

PrefListener.prototype.forceCallbacks = function () {
	//##Cu.reportError('forcing pref callbacks');
	let that = this;
	this._branch.getChildList('', {}).
	forEach(function (pref_leaf_name) {
		that._callback(that._branch, pref_leaf_name);
	});
};

PrefListener.prototype.setDefaults = function () {
	//sets defaults on the prefs in prefs obj
	//##Cu.reportError('setDefaults');
	for (var p in prefs) {
		this._defaultBranch['set' + prefs[p].type + 'Pref'](p, prefs[p].
			default);
	}
};

PrefListener.prototype.unregister = function () {
	if (this._branch)
		this._branch.removeObserver('', this);
};

var myPrefListener = new PrefListener(prefPrefix, function (branch, name) {
	//extensions.myextension[name] was changed
	//##Cu.reportError('callback start for pref: "' + name + '"');
	if (!(name in prefs)) {
		return; //added this because apparently some pref named prefPreix + '.sdk.console.logLevel' gets created when testing with builder
	}

	var refObj = {
		name: name
	}; //passed to onPreChange and onChange
	var oldVal = 'json' in prefs[name] ? prefs[name].json : prefs[name].value;
	try {
		var newVal = myPrefListener._branch['get' + prefs[name].type + 'Pref'](name);
	} catch (ex) {
		//##Cu.reportError('exception when getting newVal (likely the pref was removed): ' + ex);
		var newVal = null; //note: if ex thrown then pref was removed (likely probably)
	}

	prefs[name].value = newVal === null ? prefs[name].
	default : newVal;

	if ('json' in prefs[name]) {
		refObj.oldValStr = oldVal;
		oldVal = JSON.parse(oldVal); //function(){ return eval('(' + oldVal + ')') }();

		refObj.newValStr = prefs[name].value;
		prefs[name].json = prefs[name].value;
		prefs[name].value = JSON.parse(prefs[name].value); //function(){ return eval('(' + prefs[name].value + ')') }();
	}

	if (prefs[name].onChange) {
		prefs[name].onChange(oldVal, prefs[name].value, refObj);
	}
	//##Cu.reportError('myPrefCallback done');
});
////end pref listener stuff
//end pref stuff


function notify(msg) {
	//##Cu.reportError(selfTitle + ' - Notify - ' + msg);
	//as.showAlertNotification('nullimg', selfTitle + ' - Message', msg);
}

function winActd(e, window) {
	//##Cu.reportError('window activated');
	//Cu.reportError('e.target == window (which is aDOMWindow) ?? == ' + (e.target == window));  //yields true
	var event = e.target.document.createEvent('Events');
	event.initEvent('TabSelect', true, false);
	window.gBrowser.mCurrentTab.dispatchEvent(event);
}

function tabSeld(e, window) {
	//tabseld triggers when new tab opened and is switched to right away by default pref
	//tabsel does not fire when new window opened and initial tab loaded
	//##Cu.reportError('tabSeld');

	var aTab = e.target; //equivalent of in the window loop of: aXULWindow.gBrowser.tabContainer.childNodes[7];

	if (cTab && cTab.parentNode && cTab._findBar) { //removed from the if "cTab != aTab && " 1/2/14 1135p
		if (cTabVal != cTab._findBar._findField.value) {
			//##Cu.reportError('doing applyStateArr for last tab as cTabVal != cTab._findBar._findField.value: ' + cTabVal + ' VS ' + cTab._findBar._findField.value);
			applyStateArr(cTab._findBar, 1);
			//##Cu.reportError('DONE doing applyStateArr for last tab');
		}
	}
	cTab = e.target;
	cTabVal = cTab._findBar ? cTab._findBar._findField.value : null;

	var aXULWindow = aTab.ownerDocument.defaultView; //equiv of findbar._browser.ownerDocument.defaultView
	var aGBrowser = aXULWindow.gBrowser; //equiv of windows gBrowser
	var aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow); //equiv of findbar._browser.ownerDocument.defaultView
	var browserInTab = aTab.linkedBrowser //equiv of findbar._browser, contentWindow and contentDocument of this gives the tab contents even if tab is not focused

	var findbar = aTab._findBar;
	if (!findbar) {
		findbar = aGBrowser.getFindBar(aTab);
		var preInitVal = findbar._findField.value;
		initTab(aTab);
		var postInitVal = findbar._findField.value;

		//##Cu.reportError('pre getFindBar FINDFIELD VALUE = "' + preInitVal + '" and post initTab findfield val = "' + postInitVal + '"'); //note: noit for some reason the pre init value is matched, i cant believe this i dont know how
		if (preInitVal == postInitVal && preInitVal != '') {
			//##Cu.reportError('forcing status ui update of findbar');
			findbar._enableFindButtons( !! findbar._findField.value);
			findbar._updateStatusUI();
		}
		//the getFindBar function initiates the findBar and gives the findField the value of last findfield value (global in window i suspect) due to this line of code "findBar._findField.value = this._lastFindValue;" so thus if preInitFindFieldValue is same as post init and post init the value is not blank, then force update stuff
	} else if (!findbar.GlobalFindbarInited) {
		initTab(aTab);
	} else {
		//check findbar val arr, if wrt match (meaning: with respect to tabScope and winScope) found then inherit to this findbar the val and hid of that found row in arr. if wrt match not found then insert row into arr with this findbars params (hid, val, win, domain)
		applyStateArr(findbar, 0);
	}

	if (prefs.findbarFocus.value == 1 || prefs.findbarFocus.value == 2) {
		window.setTimeout(function () {
			//if fm.focusedWindow == [object ChromeWindow] then it == aXULWindow
			//if fm.focusedWindow == [object XrayWrapper [object Window]] then it is aXULWindow.gBrowser.contentWindow
			//Cu.reportError(fm.focusedWindow)
			//Cu.reportError(fm.focusedWindow == aXULWindow.gBrowser.contentWindow)
			if (fm.focusedWindow == window) { //tests if focus is in the chrome window, if its not that forget this, as only findbar is chrome window scope
				var findbar = aXULWindow.gBrowser.selectedTab._findBar;
				if (findbar.getAttribute('hidden')) {
					//##Cu.reportError('findbar is hidden so dont care');
					return;
				}


				var findbarDocFocusedEl = findbar.ownerDocument.activeElement;

				var findfield = findbar._findField
				var fieldhbox = findfield.ownerDocument.getAnonymousNodes(findfield)[0];
				var htmlfield = fieldhbox.ownerDocument.getAnonymousNodes(fieldhbox)[0];

				var isFindbarFocused = (findbarDocFocusedEl == htmlfield);
				//##Cu.reportError('was findbar focused just autofocused? (as tab was just seld):' + isFindbarFocused);

				if (isFindbarFocused) {
					//Cu.reportError(fm.focusedElement.nodeName);
					//var browserInTab = event.target.linkedBrowser;
					var aFocusedWindow = {};
					var subFocusedEl = fm.getFocusedElementForWindow(browserInTab.contentWindow, true, aFocusedWindow);

					//Cu.reportError('focused of tab contents window: ' + subFocusedEl)

					if (prefs.findbarFocus.value == 2) {
						//never focus findbar if open
						aFocusedWindow.value.focus();
					} else if (prefs.findbarFocus.value == 1) {
						var hasCaret = (!subFocusedEl.getAttribute('disabled') && (formHelperIsEditable(subFocusedEl) || (subFocusedEl instanceof Ci.nsIDOMHTMLInputElement && subFocusedEl.mozIsTextField(false)) || subFocusedEl instanceof Ci.nsIDOMHTMLTextAreaElement || subFocusedEl instanceof Ci.nsIDOMXULTextBoxElement));
						//##Cu.reportError('subFocusedEl has caret = ' + hasCaret);
						if (hasCaret) {
							aFocusedWindow.value.focus();
						}
					}
				}
			}
		}, 10); //can be 1ms
	} else {
		//do nothing, by default if findbar is open it always gets focused
	}
}

function formHelperIsEditable(aElement) {
	if (!aElement)
		return false;
	let canEdit = false;

	if (aElement.isContentEditable || aElement.designMode == "on") {
		canEdit = true;
	} else if (aElement.contentDocument && aElement.contentDocument.body && aElement instanceof Ci.nsIDOMHTMLInputElement &&
		(aElement.contentDocument.body.isContentEditable ||
			aElement.contentDocument.designMode == "on")) {
		canEdit = true;
	} else {
		canEdit = aElement.ownerDocument && aElement.ownerDocument.designMode == "on";
	}

	return canEdit;
}

function initTab(aTab) {
	//##Cu.reportError('initing tab');
	var aXULWindow = aTab.ownerDocument.defaultView;
	var aGBrowser = aXULWindow.gBrowser;
	var aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow);

	var findbar = aTab._findBar;
	if (!findbar) {
		findbar = aGBrowser.getFindBar(aTab);
	}

	var obsForWinFound = false;
	for (var m = 0; m < mObservers.length; m++) {
		if (mObservers[m].win == aDOMWindow) {
			mObservers[m].obs.observe(findbar, mObserverConfig);
			obsForWinFound = true;
			break;
		}
	}

	if (!obsForWinFound) {
		mObservers.push({
			win: aDOMWindow,
			obs: new aDOMWindow.MutationObserver(function (mutations) {
				mutations.forEach(function (mutation) {
					var target = mutation.target;
					var attributeName = mutation.attributeName;
					if (attributeName == 'hidden') {
						//##Cu.reportError('ATTRIBUTE HIDDEN CHANGED - ' + attributeName + ' from ' + mutation.oldValue + ' to ' + mutation.target.getAttribute('hidden'));
						if (programaticallyTogglingHid == true) {
							//##Cu.reportError('programmatic changed attr, setting it back to false');
							programaticallyTogglingHid = false;
							return;
						}
						//##Cu.reportError('user changed attr');
						applyStateArr(mutation.target, 1);
					}
				});
			})
		});
		mObservers[mObservers.length - 1].obs.observe(findbar, mObserverConfig);
	}

	findbar.GlobalFindbarInited = true;

	applyStateArr(findbar, 0) // - go through stateArr, if wrt match found then apply those params to this findbar. IF wrt match not found, then insert row to stateArr inheriting this findbars params
	//applyStateArr looks for wrt match and if found applies it, if not found then runs updateStateArr which looks for wrt match and when found it updates it (if , if not found it inserts it at top (splice(0,0,..))
	//##Cu.reportError('COMPLETED - initing tab');
}

function applyStateArr(aFindbar, updateStateArr) {
	//updateStateArr == 0: on no wrt match it will updateStateArr
	//updateStateArr == 1: updateStateArr ONLY
	//##Cu.reportError('applyStateArr, updateStateArr = ' + updateStateArr);

	//var aTab = e.target; //equivalent of in the window loop of: aXULWindow.gBrowser.tabContainer.childNodes[7];
	var browserInTab = aFindbar._browser; //equiv of findbar._browser, contentWindow and contentDocument of this gives the tab contents even if tab is not focused
	var aXULWindow = browserInTab.ownerDocument.defaultView //equiv of findbar._browser.ownerDocument.defaultView
	var aGBrowser = aXULWindow.gBrowser; //equiv of windows gBrowser
	var aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow); //equiv of findbar._browser.ownerDocument.defaultView

	var obj = {};
	obj.win = aDOMWindow;
	obj.val = aFindbar._findField.value;
	obj.hid = aFindbar.getAttribute('hidden') ? true : false; //getAttribute returns attribute value if there so true, ELSE if it is there and value is 'true' it should still return true
	obj.domain = browserInTab.currentURI;

	if (obj.domain.prePath == 'about:') {
		obj.domain = obj.domain.prePath + obj.domain.path;
	} else {
		obj.domain = obj.domain.prePath;
	}

	var winMatch; //holds if window is matched with respect to prefs.winScope
	var tabMatch; //holds if tab is matched with respect to prefs.tabScope
	var valMatch; //holds if value matches the one in the corresponding array of findbarVal
	var hidMatch;
	var found = false;
	//##Cu.reportError('searching for wrt match');
	//##Cu.reportError('prefs.winScope.value = ' + prefs.winScope.value);
	//##Cu.reportError('prefs.tabScope.value = ' + prefs.tabScope.value);
	for (var i = 0; i < fbStateArr.length; i++) {
		winMatch = true;
		tabMatch = true;
		if (prefs.winScope.value == 0) {
			if (fbStateArr[i].win != obj.win) {
				//##Cu.reportError('win mismatch ' + fbStateArr[i].win + ' vs ' + obj.win);
				winMatch = false;
			}
		}
		if (prefs.tabScope.value == 1) {
			if (fbStateArr[i].domain != obj.domain) {
				//##Cu.reportError('domain mismatch ' + fbStateArr[i].domain + ' vs ' + obj.domain);
				tabMatch = false;
			}
		}

		if (winMatch && tabMatch) {
			found = true;
			//##Cu.reportError('match found in stateArr for this findbar');
			//##Cu.reportError(['fbStateArr[i].val = "' + fbStateArr[i].val + '"', 'obj.val = "' + obj.val + '"', 'fbStateArr[i].hid = "' + fbStateArr[i].hid + '"', 'obj.hid = "' + obj.hid + '"'].join('\n'));

			if (fbStateArr[i].val == obj.val) {
				valMatch = true;
				//##Cu.reportError('stateArr and findbar val MATCH');
			} else {
				//##Cu.reportError('stateArr and findbar val MISMATCH');
			}

			if (fbStateArr[i].hid == obj.hid) {
				hidMatch = true;
				//##Cu.reportError('stateArr and findbar hid MATCH');
			} else {
				//##Cu.reportError('stateArr and findbar hid MISMATCH: fbStateArr[i].hid');
			}

			//note: todo: this happens on tabSeld, but if winScope is not perWindow (0) then cycle through windows and see if its selectedTab is true for tabMatch, if it is then set the value and hidden appropriately
			break;
		}
	}

	if (updateStateArr != 1 && found) {
		//##Cu.reportError('applyig applyStateArr');
		if (!valMatch) {
			//##Cu.reportError('val doesnt match so updating it');
			programaticallyChangingVal = true;
			//##Cu.reportError('programaticallyChangingVal set to TRUEEEE');
			aFindbar._findField.value = fbStateArr[i].val;
			programaticallyChangingVal = false;
			//##Cu.reportError('programaticallyChangingVal set back to false');
			aFindbar._enableFindButtons( !! aFindbar._findField.value);
			aFindbar._updateStatusUI();
		}
		if (!hidMatch) {
			//##Cu.reportError('updating hid as it doesnt match');
			programaticallyTogglingHid = true;
			//##Cu.reportError('programaticallyTogglingHid set to TRUEEEE');
			if (fbStateArr[i].hid) {
				//force hide bypassing animation
				aFindbar.addEventListener('transitionend', function () {
					aFindbar.removeEventListener('transitionend', arguments.callee, true);
					aFindbar.removeAttribute('style');
				}, true);
				aFindbar.setAttribute('style', 'transition-property:min-width;min-width:2px;');
				aFindbar.setAttribute('hidden', 'true');
			} else {
				//force show bypassing animation
				aFindbar.addEventListener('transitionend', function () {
					aFindbar.removeEventListener('transitionend', arguments.callee, true);
					aFindbar.removeAttribute('style');
				}, true);
				aFindbar.setAttribute('style', 'transition-property:min-width;min-width:2px;');
				aFindbar.removeAttribute('hidden');
			}
		}

		/*
		//this is if want to update findbars in other windows right away, rather then on focus
		//doesnt update live yet because i dont call applyState from the places i call it right now, like on change of input
		if (prefs.winScope.value == 1 && (!valMatch || !hidMatch)) {
			//go thru all windows that is not this window and check selectedTab, and if its tab matches criteria
			//##Cu.reportError('going thru all windows');
			var windows = wm.getEnumerator('navigator:browser');
			while (windows.hasMoreElements()) {
				var cXulWindow = windows.getNext();
				var cDomWindow = xulWindow.QueryInterface(Ci.nsIDOMWindow);
				
				if (cDomWindow == aDomWindow) {
					continue;
				}
				
				//##Cu.reportError('triggering event on cDomWindow');
				var event = cDomWindow.document.createEvent('Events');
				event.initEvent('TabSelect', true, false);
				cDomWindow.gBrowser.mCurrentTab.dispatchEvent(event);
			}
		}
		*/

	}

	if (!found) {
		//##Cu.reportError('no wrt match found in stateArr');
	}

	if ((!found && updateStateArr == 0) || updateStateArr == 1) {
		//##Cu.reportError('doing updateStateArr');
		if (found) {
			//##Cu.reportError('wrt match in stateArr: ' + uneval(fbStateArr[i]))
			//##Cu.reportError('obj: ' + uneval(obj));
			fbStateArr.splice(i, 1);
		}

		fbStateArr.splice(0, 0, obj);
	}
}

function updateStateArr(aFindbar) {

	//var aTab = e.target; //equivalent of in the window loop of: aXULWindow.gBrowser.tabContainer.childNodes[7];
	var browserInTab = findbar._browser; //equiv of findbar._browser, contentWindow and contentDocument of this gives the tab contents even if tab is not focused
	var aXULWindow = browserInTab.ownerDocument.defaultView //equiv of findbar._browser.ownerDocument.defaultView
	var aGBrowser = aXULWindow.gBrowser; //equiv of windows gBrowser
	var aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow); //equiv of findbar._browser.ownerDocument.defaultView

	var obj = {};
	obj.win = aXULWindow;
	obj.val = aFindbar._findField.value;
	obj.hid = aFindbar.getAttribute('hidden') ? true : false; //getAttribute returns attribute value if there so true, ELSE if it is there and value is 'true' it should still return true
	obj.domain = browserInTab.currentURI;

	if (obj.domain.prePath == 'about:') {
		obj.domain = obj.domain.prePath + obj.domain.path;
	} else {
		obj.domain = obj.domain.prePath;
	}


}

var windowListener = {
	//DO NOT EDIT HERE
	onOpenWindow: function (aXULWindow) {
		// Wait for the window to finish loading
		let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		aDOMWindow.addEventListener("load", function () {
			aDOMWindow.removeEventListener("load", arguments.callee, false);
			windowListener.loadIntoWindow(aDOMWindow);
		}, false);
	},
	onCloseWindow: function (aXULWindow) {},
	onWindowTitleChange: function (aXULWindow, aNewTitle) {},
	register: function () {
		// Load into any existing windows
		let XULWindows = wm.getEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow);
			windowListener.loadIntoWindow(aDOMWindow, aXULWindow);
		}
		// Listen to new windows
		wm.addListener(windowListener);
	},
	unregister: function () {
		// Unload from any existing windows
		let XULWindows = wm.getEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow);
			windowListener.unloadFromWindow(aDOMWindow, aXULWindow);
		}
		//Stop listening so future added windows dont get this attached
		wm.removeListener(windowListener);
	},
	//END - DO NOT EDIT HERE
	loadIntoWindow: function (aDOMWindow, aXULWindow) {
		var window = aDOMWindow;
		if (!window) {
			return;
		}

		if (window.gBrowser && window.gBrowser.tabContainer) {
			window.addEventListener('activate', function (e) {
				winActd(e, window)
			}, false);
			window.gBrowser.tabContainer.addEventListener('TabSelect', function (e) {
				tabSeld(e, window)
			}, false);

			initTab(window.gBrowser.selectedTab);

		}

	},
	unloadFromWindow: function (aDOMWindow, aXULWindow) {
		var window = aDOMWindow;
		if (!window) {
			return;
		}

		if (window.gBrowser && window.gBrowser.tabContainer) {
			window.removeEventListener('activate', function (e) {
				winActd(e, window)
			}, false);
			window.gBrowser.tabContainer.removeEventListener('TabSelect', function (e) {
				tabSeld(e, window)
			}, false);

			var tabbrowser = aDOMWindow.gBrowser;
			var numTabs = tabbrowser.browsers.length;

			for (var index = 0; index < numTabs; index++) {
				var aTab = tabbrowser.tabContainer.childNodes[index];
				var findbar = aTab._findBar;
				if (findbar && findbar.GlobalFindbarInited) {
					//##Cu.reportError('this tab has find bar and GlobalFindbarInited');
					delete findbar.GlobalFindbarInited;
				}
			}

		}

	}
};

function restore_old_style(val) {
	var cssUri = ios.newURI(selfPath + 'data/findBar.css', null, null);
	if (val) {
		if (!sss.sheetRegistered(cssUri, sss.USER_SHEET)) {
			sss.loadAndRegisterSheet(cssUri, sss.USER_SHEET);
			/*
            if (sss.sheetRegistered(cssUri, sss.USER_SHEET)) {  
                //##Cu.reportError('regggeed');
            } else {
                //##Cu.reportError('SHOULD HAVE regggeed BUT DIDNT');
            }
            */
		} else {
			//Cu.reportError('cssUri is already applied')
		}
	} else {
		if (sss.sheetRegistered(cssUri, sss.USER_SHEET)) {
			//Cu.reportError('was reged');
			sss.unregisterSheet(cssUri, sss.USER_SHEET)
		}
	}
}

exports.main = function (options, callbacks) {
	//##Cu.reportError('load reason: "' + options.loadReason + '"');

	//if (options.loadReason == 'install' || options.loadReason == 'enable' || options.loadReason == 'upgrade' || options.loadReason == 'downgrade') {
	myPrefListener.setDefaults(); //in jetpack they get initialized somehow on install so no need for this    //on startup prefs must be initialized first thing, otherwise there is a chance that an added event listener gets called before settings are initalized
	//setDefaults safe to run after install too though because it wont change the current pref value if it is changed from the default.
	//good idea to always call setDefaults before register, especially if true for tirgger as if the prefs are not there the value in we are forcing it to use default value which is fine, but you know what i mean its not how i designed it, use of default is a backup plan for when something happens (like maybe pref removed)
	//}
	myPrefListener.register(true); //true so it triggers the callback on registration, which sets value to current value

	//register all observers
	for (var o in observers) {
		observers[o].reg();
	}

	//load into all existing windows and into future windows on open
	windowListener.register();

};

exports.onUnload = function (reason) {
	//##Cu.reportError('onUnload reason: "' + reason + '"');

	if (prefs.restore_old_style.value) {
		restore_old_style(false);
	}

	//unregister all observers
	for (var o in observers) {
		observers[o].unreg();
	}

	//unregister all mutation observers
	for (var m = 0; m < mObservers.length; m++) {
		mObservers[m].obs.disconnect()
	}

	//load into all existing windows and into future windows on open
	windowListener.unregister();

	if (reason == 'uninstall') {
		//##Cu.reportError('deleting pref branch: ' + prefPrefix);
		ps.deleteBranch(prefPrefix);
	}
};