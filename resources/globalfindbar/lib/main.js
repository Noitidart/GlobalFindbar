const {Cc, Ci, Cu, components} = require('chrome');
const selfId = 'jid0-GlobalFindBar';
const selfTitle = 'globalfindbar';
const selfPath = 'resource://' + selfId + '-at-jetpack/' + selfTitle + '/'; //NOTE - this must be gotten from "Properties" panel //example: selfPath + 'data/style/global.css'

const wm = Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
const nsiAlertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);

const sss = Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
const ios = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
const ps = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

var global = false;
var domain = false;

var myHidden = true;
var findVal = '';
var findValSet = false;

function notify(msg) {
    //Cu.reportError(msg);
    //nsiAlertsService.showAlertNotification('nullimg', 'JumpTab - Message', msg);
}

function findFieldKeyUpped(findField) {
    findVal = findField.value;
	findValSet = true;
}

// create an observer instance
var mObservers = [];
var origCloseFunc = null;

function tabSeld(window) {
	var gBrowser = window.gBrowser;
    var tab = gBrowser.selectedTab;
	var gFindBar = window.gFindBar;

gFindBar._findField.addEventListener('keyup', function(){findFieldKeyUpped(gFindBar._findField)}, false);

	if (gFindBar.close.toSource().indexOf('findbarclose') == -1) {
		//Cu.reportError('setting up');
		
		//gFindBar._findField.setAttribute('GlobalFindBar_keyup','1');
		if (!origCloseFunc) {
			origCloseFunc = gFindBar.close.toSource();
		}
        //Cu.reportError('orig=' + origCloseFunc);
		var modded = origCloseFunc.replace('this._findFailedString = null;','this._findFailedString = null;let event = document.createEvent("Events");event.initEvent("findbarclose", true, false);this.dispatchEvent(event);');
        //Cu.reportError('modded=' + modded);
		window.eval('gFindBar.close = ' + modded);
		//Cu.reportError('setting up DONE');
	}
	
	if (gFindBar.hidden != myHidden) {
		gFindBar.hidden = myHidden;
		notify('tabSeld and gFindBar != myHidden');
	}
	if (findValSet) {
		gFindBar._findField.value = findVal;
	} else {
        //Cu.reportError('findValSet == ' + findValSet);
	}
}

function tabOpened(window) {    
	var gBrowser = window.gBrowser;
    var tab = gBrowser.selectedTab;
	var gFindBar = window.gFindBar;

}

function tabClosed(window) {
    //cleanHistory();
}

function winSeld(window) {
	var gBrowser = window.gBrowser;
    var tab = gBrowser.selectedTab;
	var gFindBar = window.gFindBar;

}

function tabLoad(window) {
/*
	var gBrowser = window.gBrowser;
    var tab = gBrowser.selectedTab;
	var gFindBar = window.gFindBar;
	if (gFindBar.hidden && !hidden) {
		gFindBar.hidden = false;
	}
	if (findValSet) {
		gFindBar._findField.value = findVal;
	}
*/
}

function findbaropen() {
	myHidden = false;
}

function findbarclose() {
	myHidden = true;
}

/**
 * Load our UI into a given window
 */
function loadIntoWindow(window) {
  if (!window)
    return;
    
    if (window.gBrowser && window.gBrowser.tabContainer) {
        window.gBrowser.tabContainer.addEventListener("TabSelect", function(){ tabSeld(window) }, false);
    	window.gBrowser.tabContainer.addEventListener("TabOpen", function(){ tabOpened(window) }, false);
    	window.gBrowser.tabContainer.addEventListener("TabClose", function(){ tabClosed(window) }, false);
		window.gBrowser.addEventListener('load', function(){ tabLoad(window) }, false);
		
		window.addEventListener('focus', function(){ tabSeld(window) }, false);
		window.addEventListener('activate', function(){ tabSeld(window) }, false);
		
		window.gBrowser.addEventListener('findbaropen',findbaropen,false);
		window.gBrowser.addEventListener('findbarclose',findbarclose,false);
		
		//Cu.reportError('added all');
    }
}

/**
 * Remove our UI into a given window
 */
function unloadFromWindow(window) {
  if (!window)
    return;

    if (window.gBrowser && window.gBrowser.tabContainer) {
        window.gBrowser.tabContainer.removeEventListener("TabSelect", function(){ tabSeld(window) }, false);
        window.gBrowser.tabContainer.removeEventListener("TabOpen", function(){ tabOpened(window) }, false);
    	window.gBrowser.tabContainer.removeEventListener("TabClose", function(){ tabClosed(window) }, false);
		window.gBrowser.removeEventListener('load', function(){ tabLoad(window) }, false);
		
		window.removeEventListener('focus', function(){ tabSeld(window) }, false);
		window.removeEventListener('activate', function(){ tabSeld(window) }, false);
		
		window.gBrowser.removeEventListener('findbaropen',findbaropen,false);
		window.gBrowser.removeEventListener('findbarclose',findbarclose,false);
	
		//Cu.reportError('removed all');

          
    }
}

var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
   
  onCloseWindow: function(aWindow) {
  },
   
  onWindowTitleChange: function(aWindow, aTitle) {
  }
};

function restore_old_style(val) {
    var cssUri = ios.newURI(selfPath + 'data/findBar.css', null, null);
    if (val) {
        if (!sss.sheetRegistered(cssUri, sss.USER_SHEET)) {
            sss.loadAndRegisterSheet(cssUri, sss.USER_SHEET);
            /*
            if (sss.sheetRegistered(cssUri, sss.USER_SHEET)) {  
                Cu.reportError('regggeed');
            } else {
                Cu.reportError('SHOULD HAVE regggeed BUT DIDNT');
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
    //options.loadReason
    myPrefListener.register(true);

    restore_old_style(prefs.restore_old_style.value);

  // Load into any existing windows
  let windows = wm.getEnumerator('navigator:browser');
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
    /* was just testing if domWindow == window which is parentNode of gBrowser and its true domWindow is the parentNode of gBrowser
    if (domWindow == wm.getMostRecentWindow(null)) {
        notify('this is the most recently used window');
        notify('its gBrowser = ' + domWindow.gBrowser);
    }
    */
  }
 
  // Load into any new windows
  wm.addListener(windowListener);
    
};

exports.onUnload = function(reason) {
    //Cu.reportError('onUnload reason: "' + reason + '"');   

    restore_old_style(false);

  // Stop listening for new windows
  wm.removeListener(windowListener);
 
  // Unload from any existing windows
  let windows = wm.getEnumerator('navigator:browser');
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
  
    if (reason == 'uninstall') {
		ps.deleteBranch(prefPrefix);
	}
  
};

const prefPrefix = 'extensions.' + selfId + '@jetpack.';
var prefs = { //each key here must match the exact name the pref is saved in the about:config database (without the prefix)
    restore_old_style: {
		default: true,
		value: null,
		type: 'Bool',
		onChange: function(oldVal, newVal) {
			restore_old_style(newVal);
		}
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
  var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
  this._branch = prefService.getBranch(branch_name);
  this._branch.QueryInterface(Ci.nsIPrefBranch2);
  this._callback = callback;
}

PrefListener.prototype.observe = function(subject, topic, data) {
  if (topic == 'nsPref:changed')
    this._callback(this._branch, data);
};

/**
 * @param {boolean=} trigger if true triggers the registered function
 *   on registration, that is, when this method is called.
 */
PrefListener.prototype.register = function(trigger) {
  this._branch.addObserver('', this, false);
  if (trigger) {
    let that = this;
    this._branch.getChildList('', {}).
      forEach(function (pref_leaf_name)
        { that._callback(that._branch, pref_leaf_name); });
  }
};

PrefListener.prototype.unregister = function() {
  if (this._branch)
    this._branch.removeObserver('', this);
};

var myPrefListener = new PrefListener(prefPrefix, function (branch, name) {
    //extensions.myextension[name] was changed
	if (name in prefs) {
		//blah
	} else {
		return; //added this because apparently some pref named prefPreix + '.sdk.console.logLevel' gets created when testing with builder
	}
	var oldVal = 'json' in prefs[name] ? prefs[name].json : prefs[name].value;
	var newVal = ps['get' + prefs[name].type + 'Pref'](prefPrefix + name);

	if (prefs[name].onPreChange) {
		prefs[name].onPreChange(oldVal, newVal);
	}

	prefs[name].value = 'json' in prefs[name] ? JSON.parse(newVal) : newVal;
    
	if (prefs[name].onChange) {
		prefs[name].onChange(oldVal, newVal);
	}
});
////end pref listener stuff
//end pref stuff