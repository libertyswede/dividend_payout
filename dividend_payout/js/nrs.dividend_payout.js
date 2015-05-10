/**
 * @depends {nrs.js}
 */
 
var NRS = (function(NRS, $, undefined) {
	var assetId = "";
	var assetIssuerId = 0;
	var assetIssuerRs = "";
	var assetDecimals = 0;
	var assetNumberOfTrades = 0;
	var assetNumberOfTransfers = 0;
	var decimalMultiplier = 0;
	var assetQuantityQnt = 0;
	var assetName = "";
	var height = 0;
	var amountNQTPerQNT = 0;
	var amountNXTPerQNT = 0;
	var totalSpendNQT = 0;
	var totalSpendNXT = 0;
	var genesisAccountId = 1739068987193023818;
	var genesisAccountRs = "NXT-MRCC-2YLS-8M54-3CMAJ";
	var accountAssets = [];
	
	getTransaction = function() {
		NRS.sendRequest("getTransaction", { "transaction": $('#transactionId').val() }, function(response) {
			if (response.type === 2 && response.subtype === 6) {
				assetId = response.attachment.asset;
				height = response.attachment.height;
				amountNQTPerQNT = response.attachment.amountNQTPerQNT;
				amountNXTPerQNT = amountNQTPerQNT / 100000000;
				getAsset();
			}
		});
	}
	
	getAsset = function() {
		NRS.sendRequest("getAsset", { "asset": assetId, "includeCounts": true }, function(response) {
			assetName = response.name;
			assetIssuerId = response.account;
			assetIssuerRs = response.accountRS;
			assetQuantityQnt = response.quantityQNT;
			assetNumberOfTrades = response.numberOfTrades;
			assetNumberOfTransfers = response.numberOfTransfers;
			assetDecimals = response.decimals;
			decimalMultiplier = Math.pow(10, assetDecimals);
			getAssetAccounts();
		});
	}
	
	getAssetAccounts = function() {
		NRS.sendRequest("getAssetAccounts", { "asset": assetId, "height": height }, function(response) {
			if (response.errorDescription != undefined && response.errorDescription.match("^Historical data as of height")) {
				calculateAssetOwnership();
				return;
			}
			accountAssets = response.accountAssets;
			accountAssets = jQuery.grep(accountAssets, function(value) {
				return value.account != genesisAccountId && value.account != assetIssuerId;
			});
			assetQuantityQnt = 0;
			$.each(accountAssets, function(index, value) {
				assetQuantityQnt += parseInt(value.quantityQNT);
			});
			totalSpendNQT = assetQuantityQnt * amountNQTPerQNT;
			totalSpendNXT = totalSpendNQT / 100000000;
			setValues();
		});
	}
	
	getTrades = function(owners, index) {
		var deferred = new $.Deferred();
		NRS.sendRequest("getTrades", { "asset": assetId, "firstIndex": index, "lastIndex": index + 100 }, function(response) {
			$.each(response.trades, function(index, value) {
				if (value.height <= height) {
					var quantity = parseInt(value.quantityQNT);
					if (owners[value.buyerRS] == undefined) {
						owners[value.buyerRS] = 0;
					}
					if (owners[value.sellerRS] == undefined) {
						owners[value.sellerRS] = 0;
					}
					owners[value.buyerRS] += quantity;
					owners[value.sellerRS] -= quantity;
				}
			});
			deferred.resolve(owners);
		});
		return deferred;
	}
	
	getTransfers = function(owners, index) {
		var deferred = new $.Deferred();
		NRS.sendRequest("getAssetTransfers", { "asset": assetId, "firstIndex": index, "lastIndex": index + 100 }, function(response, i) {
			$.each(response.transfers, function(index, value) {
				if (value.height <= height) {
					var quantity = parseInt(value.quantityQNT);
					if (owners[value.recipientRS] == undefined) {
						owners[value.recipientRS] = 0;
					}
					if (owners[value.senderRS] == undefined) {
						owners[value.senderRS] = 0;
					}
					owners[value.recipientRS] += quantity;
					owners[value.senderRS] -= quantity;
				}
			});
			deferred.resolve(owners);
		});
		return deferred;
	}
	
	calculateAssetOwnership = function() {
		var owners = {};
		owners[assetIssuerRs] = parseInt(assetQuantityQnt);
		var promises = [];
		for (var index = 0; index < assetNumberOfTrades; index += 100) {
			promises.push(getTrades(owners, index));
		}
		for (index = 0; index < assetNumberOfTrades; index += 100) {
			promises.push(getTransfers(owners, index));
		}
		
		$.when.apply($, promises).done(function() {
			for (var owner in owners) {
				if (owners[owner] == 0 || owner == genesisAccountRs || owner == assetIssuerRs) {
					delete owners[owner];
				}
			}
			assetQuantityQnt = 0;
			accountAssets = [];
			for (var owner in owners) {
				accountAssets.push({accountRS: owner, quantityQNT: owners[owner]});
				assetQuantityQnt += owners[owner];
			}
			accountAssets.sort(function(a, b) {
				if (a.quantityQNT < b.quantityQNT) return 1;
				return -1;
			});
			totalSpendNQT = assetQuantityQnt * amountNQTPerQNT;
			totalSpendNXT = totalSpendNQT / 100000000;
			setValues();
        });
	}
	
	setValues = function() {
		$("#assetInfo").text(assetName + " (" + assetId + ")");
		$("#dividendHeight").text(height);
		$("#totalSpent").text(totalSpendNXT);
		$("#perShare").text(amountNXTPerQNT * decimalMultiplier);
		$("#numberOfShareholders").text(accountAssets.length);
		$("#dividendInfo").css("display", "block");
		var rows = "";
		$.each(accountAssets, function(index, value) {
			rows += "<tr>";
			rows += "<td>" + "<a href='#' data-user='" + String(value.accountRS).escapeHTML() + "' class='show_account_modal_action user-info'>";
			rows += String(value.accountRS).escapeHTML() + "</a>" + "</td>";
			rows += "<td align=\"left\">" + value.quantityQNT / decimalMultiplier + "</td>";
			rows += "<td align=\"left\">" + value.quantityQNT * amountNXTPerQNT + "</td>";
			rows += "</tr>"; 
		});
		NRS.dataLoaded(rows);
	}
	
	NRS.pages.p_dividend_payout = function() {
		var rows = "";
		$('#transactionForm').submit(function(event) {
			getTransaction();
			event.preventDefault();
		});
	}

	NRS.setup.p_dividend_payout = function() {
		//Do one-time initialization stuff here
	}
	return NRS;
}(NRS || {}, jQuery));

//File name for debugging (Chrome/Firefox)
//@ sourceURL=nrs.dividends.js