/* https://github.com/MiguelCastillo/load-js/tree/master. */
static loadJS = (function createLoadJS() {
	var _loadedScripts = {}; //store scrips promise that being loaded by Loadjs
	var head = document.getElementsByTagName("head")[0] || document.documentElement;
	const _WATERMARK = "Chinhvtr";
	DBFiles.WATERMARK = _WATERMARK; //saved to wrapper class for later use

	/* HELPER FUNCTIONS */
	/** get script THAT LOADED by LoadJS */
	function getScriptById(id) {
		var script = id && document.getElementById(id);

		if (script && script.watermark !== _WATERMARK) {
			console.warn("load-js: duplicate script with id:", id);
			return script;
		}
	}

	/** get script THAT LOADED by LoadJS */
	function getScriptByUrl(url) {
		var script = url && document.querySelector("script[src='" + url + "']");

		if (script && script.watermark !== _WATERMARK) {
			console.warn("load-js: duplicate script with url:", url);
			return script;
		}
	}

	/** append script text (set in options.text) in the case that options.url is missing. Because options.text contain the js code already, so script should be loaded immediately without any delay, meaning no need to handle the async state of the script 
	 * @param head: the document.head element
	 * @param script: the script element that created by createScript() but not yet append to the DOM
	*/
	function appendScriptByText(head, script) {
		head.appendChild(script);
		return Promise.resolve(script);
	}

	/** append script by url (speified in options.url), so we use Promise to handle async state of script load 
	 * @param head: the document.head element
	 * @param script: the script element that created by createScript() but not yet append to the DOM
	*/
	function appendScriptByUrl(head, script) {
		return new Promise(function(resolve, reject) {
		// Handle Script loading
		var done = false;

		// Attach handlers for all browsers.
		//
		// References:
		// http://stackoverflow.com/questions/4845762/onload-handler-for-script-tag-in-internet-explorer
		// http://stevesouders.com/efws/script-onload.php
		// https://www.html5rocks.com/en/tutorials/speed/script-loading/
		//
		script.onload = script.onreadystatechange = function() {
			if (!done && (!script.readyState || script.readyState === "loaded" || script.readyState === "complete")) {
			done = true;

			// Handle memory leak in IE
			script.onload = script.onreadystatechange = null;
			resolve(script);
			}
		};

		script.onerror = reject;

		head.appendChild(script);
		});
	}

	/* IMPORTAN FUNCTIONS */

	/** function to create script and attached properties, attributes to script element for later processing when script file is loaded or failed-loading. Note that for now, the script has not been appended to the DOM
	 * @param option: json of all attributes that need to config the script element and some other atttribute added to elements for using later. See https://github.com/MiguelCastillo/load-js/tree/master for list of default attribute like type, async, charset, id, url, text, cache (I renamed to 'cacheEnable'), debug
	 * ADDED: jsDBName, loadMode, allowReload, urlVersion
	 * @return the script element
	 */
	function createScriptElem(options) {
		var script = document.createElement("script");
		script.charset = options.charset || "utf-8";
		script.type = options.type || "text/javascript";
		script.async = !!options.async; //default false
		script.id = (options.id || options.url).split("?")[0]; //without param of url if there any
		//jsDBName to store the name of data variable inside data file. For now, each file should have only one data variable, such as data_0.js has only one const json-like object 'data_0'
		script.jsDBName = options.jsDBName || options.url;
		//loadMode: the loadMode (1 - fresh loaded ignoring the cache, 2 - using the cache if there any)
		script.loadMode = options.loadMode || 2;
		script.watermark = _WATERMARK;

		/* Using version paramet '?v={version_number}' to force the browser to re-load and script file (mostly through file url) */
		const _DEF_VERSION = Math.round(performance.now()); //101;
		let _dbUrl = options.url;
		const _versReg = _dbUrl.match(/v\=(\d+)/);
		if(_versReg){
			let _version = parseInt(_versReg[1]);
			if(isNaN(_version)) _version = _DEF_VERSION;
			// if this load is fresh-load (loadMode == 1): change the version so the js file load will ignore browser's cache. Other mode loadMode= -1 (called from addJsDataFiles()) or =2, using cache if applicable
			if(options.loadMode == 1)  _dbUrl = _dbUrl.replace(_versReg[0], "v=" + (++_version));
		}
		else _dbUrl += (_dbUrl.indexOf("?")>-1? "": "?") + "v=" + _DEF_VERSION; //assign a initial version number
		
		//save new versionning into urlVersion of script element, so later in loadPage, we can update the new version into xDBFilesCfg.toLoad[index].dbUrl
		script.urlVersion = options.url = _dbUrl;

		if (options.url) { script.src = options.url; }
		if (options.text) { script.text = options.text; }
		return script;
	}

	/** function to create script and append it to the DOM. Note that this function only support for one script only. This function also handle some situation like duplicate load by loadJs or duplicate with hard-coded markup.
	 * @param option: config for the single script to be load
	 * @return a promise wrapping the script
	 */
	 function exec(options) {
		// if user only invokde loadJS with a string as parameter like loadJS('https://code.jquery.com/jquery-2.2.1.js'), consider as loading by url
		if (typeof options === "string") {
			options = {
				url: options,
				debug: false
			};
		}
		//console.log(_loadedScripts);

		// cache here just to avoid same js files being loaded twice in the SAME session, with requirement both are loaded by loadJS
		let _scriptId = (options.id || options.url).split('?')[0]; //get url without param
		let _scriptEntry = _loadedScripts[_scriptId]; //see if script already in loadJS cache

		if (_scriptEntry && !options.allowReload) {
			if (!!options.debug) {
				console.log("load-js: Script hit - this script has been loaded in current page session", _scriptId);
			}
			//if options.allowReload = true: return script Promise right away without reloading it
			return _scriptEntry;
		}
		else if (options.allowExternal !== false) { //except explicitly set allowExternal == false
			let el = getScriptById(options.id) || getScriptByUrl(options.url);

			// return promise script without checking if head has other script element which same id (or url) that Not loaded by loadJs?
			if (el) {
				var promise = Promise.resolve(el);
				// save to cache without checking cacheEnable flag?
				if (_scriptId) { _loadedScripts[_scriptId] = promise; }
				return promise;
			}
		}

		if (!options.url && !options.text) {
			throw new Error("load-js: must provide a url or text to load");
		}

		// depding on the type of script (code or url), we need different function to append the script and handle async nature of the script to the DOM
		var pendingPromise = (options.url ? appendScriptByUrl : appendScriptByText)(head, createScriptElem(options));

		//if cacheEnable is not false, save this script inside _loadedScripts for later check duplication
		if (_scriptId && options.cacheEnable !== false) { _loadedScripts[_scriptId] = pendingPromise; }

		return pendingPromise;
	}

	/** load one script or array of script 
	 * @param items is one item or array of items. Each item can be a string which contains url of the script or a json. If item is an json, the json is actually the option which has attributes as described in wrapper loadJS comments above
	 * 
	 * @return
	 * if @items is one item, it will return the script element directly
	 * if @items is array of items, it will return the array of result json which has one of following formats:
	 * 		success: {status: 'fulfilled', value: ...the script element...}
	 * 		failed:  {status: 'rejected', reason: ...the script element...}
	 * See createScript() for the handy, customized property that added to script element like id, jsDBName, loadMode, urlVersion, watermark, type, charset
	*/
	return function load(items) {
		return items instanceof Array ? Promise.allSettled(items.map(exec)) : exec(items);
	}
})();
