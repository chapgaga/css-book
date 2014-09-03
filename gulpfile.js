"use strict";
var fs = require("fs"),
	path = require("path"),
	gulp = require("gulp");

// JSON格式文件读取
function readOptionalJSON(filepath) {
	var data = {};
	try {
		data = JSON.parse(fs.readFileSync(filepath));
	} catch (e) {}
	return data;
}

function parseHtml(rawHtml) {
	var htmlparser = require("htmlparser"),
		handler = new htmlparser.DefaultHandler(function(error, dom) {
			if (error) {
				//[...do something for errors...]
			} else {
				//[...parsing done, do something...]
			}
		}),
		parser = new htmlparser.Parser(handler);
	parser.parseComplete(rawHtml);
	return handler.dom;
}

// HTML节点查找
function queryHTML(obj, fn) {
	if (obj) {
		if (Array.isArray(obj)) {
			for (var rst, i = obj.length - 1; i >= 0; i--) {
				rst = queryHTML(obj[i], fn);
				if (rst) {
					return rst;
				}
			}
		}
		if (fn(obj)) {
			return obj;
		} else if (obj.children) {
			return queryHTML(obj.children, fn)
		}
	}
}

// HTML node查找
function queryTag(obj, tagName) {
	if (obj && obj.children) {
		var rst = obj.children.filter(function(node) {
			return node.type === "tag" && node.name == tagName;
		});
		if (rst && rst.length) {
			return rst;
		}
	}
}

// 转换ul标签为数组
function parseUl(ul) {
	if (ul) {
		var children = queryTag(ul, "li");
		if (children && children.length) {
			children = children.map(parseLi);
			if (children && children.length) {
				return children;
			}
		}
	}
}

// 转换li标签对象
function parseLi(li) {
	var link = queryTag(li, "div")[0];
	link = (queryTag(link, "a") || queryTag(link, "dfn"))[0];

	var obj = {
		title: link.children[0].data
	};
	var children = queryTag(li, "ul");
	if (children) {
		children = parseUl(children[0]);
		if (children) {
			obj.children = children;
		}
	}
	if (link.attribs && link.attribs.href) {
		obj.href = link.attribs.href;
	}

	// console.log(link);
	return obj;
}

// 目录遍历，排除git目录和node模块目录
function recurse(rootdir, callback, subdir) {
	var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
	fs.readdirSync(abspath).forEach(function(filename) {
		var filepath = path.join(abspath, filename);
		if (fs.statSync(filepath).isDirectory()) {
			if (!/^(node_modules|\.git)/.test(filepath)) {
				recurse(rootdir, callback, path.join(subdir || '', filename || ''));
			}
		} else {
			callback(filepath, rootdir, subdir, filename);
		}
	});
};

// 生成连续空格
function tab(num) {
	var str = "";
	for (var i = 0; i < num; i++) {
		str += "\t";
	}
	return str;
}

// 缩进所用的数据
var indentData = {
	section: tab(1),
	div: tab(2),
	h2: tab(2),
	ul: tab(3),
	li: tab(4),
	table: tab(3),
	thead: tab(4),
	tbody: tab(4),
	tr: tab(5),
	th: tab(6),
	td: tab(6)
}

// 生成缩进
function indent(s, tag, tagName) {
	return "\n" + (indentData[tagName] || tab(1)) + tag;
}

// 使用caniuse.com数据自动生成兼容性图表
function caniuseData(str, index, html) {
	var category = queryHTML(parseHtml(html), function(obj) {
			return obj.type == "tag" && obj.attribs && obj.attribs.id == "category";
		}),
		propFix = {
			"user-select": "user-select-none"
		},
		classFix = {
			p: "partsupport",
			n: "unsupport",
			y: "support"
		},
		tabData = {},
		rowNum = 0,
		propName,
		caniuse,
		status,
		thead,
		tbody,
		data,
		i,
		j,
		k;

	if (category) {
		propName = category.attribs.name;
		caniuse = require('caniuse-db/data');
		data = caniuse.data["css-" + propName] || caniuse.data[propFix[propName] || propName];
		if (data) {
			console.log("自动生成兼容性数据：\t" + category.attribs.rel + "/" + propName);
			status = data.stats;
			str = '<!-- compatible:start --><section id="compatible" class="g-mod g-attr"><h2 class="tit">兼容性：</h2><div class="cont"><ul class="support-type"><li><span class="support">浅绿</span> = 支持</li><li><span class="unsupport">红色</span> = 不支持</li><li><span class="partsupport">粉色</span> = 部分支持</li></ul><table class="g-data"><thead><tr>';
			thead = "";
			tbody = "";

			for (i in status) {
				thead += '<th><span class="browser-' + i + '">' + caniuse.agents[i].browser + '</span></th>';
				tabData[i] = {};
				for (j in status[i]) {
					if (!/^u/i.test(status[i][j])) {
						if (tabData[i][status[i][j]]) {
							tabData[i][status[i][j]].push(j)
						} else {
							tabData[i][status[i][j]] = [j];
						}
					}
				}
				for (j in tabData[i]) {
					tbody = tabData[i][j].join().split(/\s*[,-]\s*/g).map(function(val) {
						try {
							return parseFloat(val);
						} catch (ex) {
							return val;
						}
					}).sort(function(a, b) {
						return a - b;
					});
					if (tbody.length === 1) {
						tabData[i][j] = tbody;
					} else {
						tabData[i][j] = [tbody[0], tbody[tbody.length - 1]];
					}
				}
				tbody = [];
				for (j in tabData[i]) {
					tbody.push({
						className: classFix[j.substr(0, 1)],
						prefix: /\bx\b/.test(j),
						value: tabData[i][j],
						type: j
					});
				}
				tabData[i] = tbody.sort(function(a, b) {
					return a.value[0] - b.value[0];
				});
				rowNum = Math.max(rowNum, tbody.length);
			}
			for (i in tabData) {
				tabData[i][tabData[i].length - 1].rowspan = rowNum - tabData[i].length + 1;
			}
			tbody = "";
			for (i = 0; i < rowNum; i++) {
				tbody += "<tr>";
				for (j in status) {
					if (tabData[j][i]) {
						tbody += "<td" + (tabData[j][i].rowspan > 1 ? ' rowspan="' + tabData[j][i].rowspan + '"' : "") + (tabData[j][i].className ? ' class="' + tabData[j][i].className + '"' : "") + ">" + tabData[j][i].value.join("-") + (tabData[j][i].prefix ? ' <sup class="fix">-' + caniuse.agents[j].prefix + '-</sup>' : "") + "</td>";
					}
				}
				tbody += "</tr>";
			}
			str += thead + "</tr></thead><tbody>" + tbody + "</tbody></table></div></section><!-- compatible:end -->";
			str = str.replace(/(\s*<\/?(ul|div|section|tr|t\w{2,})(\s[^>]+)*>\s*)/ig, "\n$1\n").replace(/(<\/(li|h\d|th|td)>\s*)/ig, "$1\n").replace(/\n+(<[\/\!]?(\w+)?)/g, indent);
		} else {
			console.log("不能生成兼容性数据(caniuse数据中无此项)：\t" + category.attribs.rel + "/" + propName);
		}
	}
	return str;
}

// html验证
gulp.task("htm", function() {
	console.log("正在检查所有html文件代码是否合法，请稍候~~~");

	var replace = require('gulp-replace'),
		htmlhint = require("gulp-htmlhint");
	recurse(".", function(filepath, rootdir, subdir, filename) {
		if (/\.html?$/.test(filename)) {
			gulp.src(filepath)
				.pipe(replace(/<\!--\s*compatible\s*:\s*start\s*-->[\s\S]*<!--\s*compatible\s*:\s*end\s*-->/g, caniuseData))
				//.pipe(replace("    ", "\t"))
				.pipe(htmlhint())
				.pipe(htmlhint.reporter())
				.pipe(gulp.dest(subdir || "."));
		}
	});
});

//生成chm文件
gulp.task("chm", function() {
	console.log("正在生成工程文件");
	var tree = queryHTML(parseHtml(fs.readFileSync("index.htm")), function(obj) {
		return obj.type == "tag" && obj.attribs && obj.attribs.id == "dytree";
	});

	// 遍历目录树
	function forEachTree(tree, fn) {
		if (tree.href) {
			fn(tree);
		}
		if (Array.isArray(tree.children)) {
			hhc += "<UL>";
			tree.children.forEach(function(tree) {
				forEachTree(tree, fn);
			});
			hhc += "</UL>";
		}
	}

	if (tree) {
		tree = parseUl(tree)[0];

		var pkg = readOptionalJSON("package.json"),
			html = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN"><HTML><HEAD><meta name="GENERATOR" content="Microsoft&reg; HTML Help Workshop 4.1"><!-- Sitemap 1.0 --></HEAD><BODY>',
			hhk = html + "<UL>",
			hhc = html + '<OBJECT type="text/site properties"><param name="ExWindow Styles" value="0x200"><param name="Window Styles" value="0x800025"><param name="Font" value="MS Sans Serif,9,0"></OBJECT>',
			hhp = "[OPTIONS]\nCompatibility=1.1 or later\nCompiled file=css.chm\nContents file=css.hhc\nDefault topic=quicksearch.htm\nDisplay compile progress=No\nFull-text search=Yes\nIndex file=css.hhk\nLanguage=0x804 中文(简体，中国)\nTitle=" + pkg.description + "\n\n\n[FILES]\n",
			files = {};

		recurse(".", function(abspath, rootdir, subdir, filename) {
			if (!/^(ZeroClipboard\.swf|\w+\.psd)$/.test(filename) && subdir && !/^images$/.test(subdir)) {
				files[path.normalize(subdir + "/" + filename)] = true;
			}
		});

		forEachTree(tree, function(o) {
			hhk += '<LI><OBJECT type="text/sitemap"><param name="Name" value="' + o.title + '"><param name="Local" value="' + o.href + '"></OBJECT>';
			var filepath = path.normalize(o.href);
			if (files[filepath] || fs.existsSync(filepath)) {
				files[filepath] = "ok";
			} else {
				console.log("发现死链接(文件不存在):\t" + o.href);
			}
			hhc += '<LI><OBJECT type="text/sitemap"><param name="Name" value="' + o.title + '"><param name="Local" value="' + o.href + '"><param name="ImageNumber" value="' + (o.children ? 1 : (/\//.test(o.href) ? 11 : 15)) + '"></OBJECT>'
		});

		hhk += "</UL></BODY></HTML>";

		hhc += "</BODY></HTML>";

		for (var i in files) {
			hhp += i + "\n";
			if (/\.html?$/.test(i) && files[i] !== "ok") {
				console.log("发现死文件(没有链接指向此文件):\t" + i);
			}
		}

		var iconv = require('iconv-lite');
		hhk = iconv.encode(hhk, "gbk");
		hhc = iconv.encode(hhc, "gbk");
		hhp = iconv.encode(hhp, "gbk");
		fs.writeFileSync("css.hhk", hhk);
		fs.writeFileSync("css.hhc", hhc);
		fs.writeFileSync("css.hhp", hhp);

		var hhcPath;
		["hhc.exe", "C:\\Program Files (x86)\\HTML Help Workshop\\hhc.exe", "C:\\Program Files\\HTML Help Workshop\\hhc.exe"].forEach(function(path) {
			if (!hhcPath && fs.existsSync(path)) {
				hhcPath = /\s/.test(path) ? '"' + path + '"' : path;
				return false;
			}
		});
		var exec = require("child_process").exec,
			opener = require("opener");

		if (hhcPath) {
			exec("taskkill /F /IM hh.exe", function() {
				console.log("正在编译chm");
				exec(hhcPath + " css.hhp", function(error, stdout, stderr) {
					if (stderr) {
						console.log(stderr);
						console.log("chm编译发生错误");
					} else {
						opener("css.chm");
						var rimraf = require("rimraf");
						rimraf("css.hhk", function() {});
						rimraf("css.hhc", function() {});
						rimraf("css.hhp", function() {});
						console.log("chm编译成功");
					}
				});
			});
		} else {
			console.log("未找到hhc.exe，请安装HTML Help Workshop后将其拷贝至当前目录");
			opener("css.hhp");
		}
	}
});

gulp.task("default", ["htm", "chm"]);