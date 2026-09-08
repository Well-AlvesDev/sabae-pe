/**
 * Sincroniza os registros de chamada do Supabase com a planilha ativa.
 *
 * Configure em Apps Script > Configuracoes do projeto > Propriedades do script:
 * SUPABASE_URL      = https://seu-projeto.supabase.co
 * SUPABASE_ANON_KEY = sua-chave-anon
 * SUPABASE_TABLE    = TBDA (opcional)
 *
 * O Web App recebe o nome ou numero do mes em request.month e usa a aba
 * correspondente (por exemplo, Agosto -> Ago). No envio incremental, ele
 * agrupa as chamadas por mes e faz uma consulta ao Supabase por aba.
 *
 * Para um botao da planilha, atribua a funcao sincronizarChamadasSupabase
 * informando o mes desejado.
 */
var HEADER_ROW = 13;

function sincronizarChamadasSupabase(monthValue) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var properties = PropertiesService.getScriptProperties();
    var baseUrl = requiredProperty_(properties, 'SUPABASE_URL').replace(/\/$/, '');
    var anonKey = requiredProperty_(properties, 'SUPABASE_ANON_KEY');
    var tableName = properties.getProperty('SUPABASE_TABLE') || 'TBDA';
    var month = normalizeMonth_(monthValue);
    var sheetName = getMonthSheetName_(month);
    var sheet = sheetName
      ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
      : SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    if (!sheet) {
      throw new Error('A aba do mes ' + month.label + ' (' + month.sheetName + ') nao foi encontrada.');
    }

    var columns = ['MAT', 'NOME', 'TURMA', 'TURNO', 'STATUS'];
    for (var day = 1; day <= 31; day += 1) {
      columns.push(String(day));
    }

    var matriculas = getSheetMatriculas_(sheet);
    var rows = fetchAllRows_(baseUrl, anonKey, tableName, columns, matriculas);
    var values = [columns].concat(rows.map(function(row) {
      return columns.map(function(column) {
        var value = row[column] == null ? '' : row[column];
        return isDayColumn_(column) ? getStatusForMonth_(value, month.number) : value;
      });
    }));

    var oldLastRow = sheet.getLastRow();
    var oldLastColumn = sheet.getLastColumn();
    if (oldLastRow >= HEADER_ROW && oldLastColumn > 0) {
      sheet.getRange(HEADER_ROW, 1, oldLastRow - HEADER_ROW + 1, oldLastColumn).clearContent();
    }

    sheet.getRange(HEADER_ROW, 1, values.length, columns.length).setValues(values);
    sheet.setFrozenRows(HEADER_ROW);
    sheet.getRange(HEADER_ROW, 1, 1, columns.length).setFontWeight('bold');
    SpreadsheetApp.flush();

    return 'Sincronizacao concluida: ' + rows.length + ' registro(s).';
  } finally {
    lock.releaseLock();
  }
}

/**
 * Permite disparar a sincronizacao por um Web App do Apps Script.
 * O Angular so deve usar este endpoint depois de publicar o script como Web App.
 */
function doPost(event) {
  try {
    var request = parseRequest_(event);
    var message = Array.isArray(request.calls)
      ? sincronizarChamadasSelecionadas_(request.calls)
      : sincronizarChamadasSupabase(request.month);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: message }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: String(error.message || error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function sincronizarChamadasSelecionadas_(calls) {
  if (!calls.length) {
    throw new Error('Nenhuma chamada enviada foi informada.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
  var properties = PropertiesService.getScriptProperties();
  var baseUrl = requiredProperty_(properties, 'SUPABASE_URL').replace(/\/$/, '');
  var anonKey = requiredProperty_(properties, 'SUPABASE_ANON_KEY');
  var tableName = properties.getProperty('SUPABASE_TABLE') || 'TBDA';
  var updatedCells = 0;
  var groups = {};

  calls.forEach(function(call) {
    var month = normalizeMonth_(call.month);
    var day = normalizeDay_(call.day);
    var room = String(call.room || '').trim();
    if (!room) {
      throw new Error('A sala da chamada nao foi informada.');
    }

    var groupKey = String(month.number);
    if (!groups[groupKey]) {
      groups[groupKey] = { month: month, days: {}, rooms: {} };
    }
    groups[groupKey].days[day] = true;
    groups[groupKey].rooms[room] = true;
  });

  Object.keys(groups).forEach(function(groupKey) {
    var group = groups[groupKey];
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(group.month.sheetName);
    if (!sheet) {
      throw new Error('A aba do mes ' + group.month.label + ' (' + group.month.sheetName + ') nao foi encontrada.');
    }

    var lastColumn = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    var headers = lastColumn > 0
      ? sheet.getRange(HEADER_ROW, 1, 1, lastColumn).getDisplayValues()[0]
      : [];
    var matColumn = findHeaderIndex_(headers, 'MAT');
    var roomColumn = findHeaderIndex_(headers, 'TURMA');
    var days = Object.keys(group.days);
    var dayColumns = {};
    days.forEach(function(day) {
      dayColumns[day] = findHeaderIndex_(headers, day);
      if (dayColumns[day] === -1) {
        throw new Error('A aba ' + group.month.sheetName + ' precisa ter a coluna ' + day + '.');
      }
    });
    var firstDayColumn = Math.min.apply(null, days.map(function(day) { return dayColumns[day]; }));
    var lastDayColumn = Math.max.apply(null, days.map(function(day) { return dayColumns[day]; }));
    if (matColumn === -1 || roomColumn === -1) {
      throw new Error('A aba ' + group.month.sheetName + ' precisa ter as colunas MAT e TURMA.');
    }

    var rowsByKey = {};
    var rooms = Object.keys(group.rooms);
    fetchRowsForCalls_(baseUrl, anonKey, tableName, rooms, days).forEach(function(row) {
      var key = String(row.TURMA || '').trim() + '\u0000' + String(row.MAT || '').trim();
      rowsByKey[key] = row;
    });

    var dataRowCount = Math.max(0, lastRow - HEADER_ROW);
    var sheetData = dataRowCount
      ? sheet.getRange(HEADER_ROW + 1, 1, dataRowCount, lastColumn).getDisplayValues()
      : [];
    var values = sheetData.map(function(row) {
      var key = String(row[roomColumn] || '').trim() + '\u0000' + String(row[matColumn] || '').trim();
      var sourceRow = rowsByKey[key];
      if (sourceRow) {
        days.forEach(function(day) {
          row[dayColumns[day]] = getStatusForMonth_(sourceRow[day], group.month.number);
          updatedCells += 1;
        });
      }
      return row;
    });

    if (values.length) {
      sheet.getRange(HEADER_ROW + 1, firstDayColumn + 1, values.length, lastDayColumn - firstDayColumn + 1)
        .setValues(values.map(function(row) {
          return row.slice(firstDayColumn, lastDayColumn + 1);
        }));
    }
  });

  SpreadsheetApp.flush();
  return 'Sincronizacao incremental concluida: ' + updatedCells + ' celula(s) atualizada(s).';
  } finally {
    lock.releaseLock();
  }
}

function fetchRowsForCalls_(baseUrl, anonKey, tableName, rooms, days) {
  var select = ['MAT', 'NOME', 'TURMA', 'TURNO', 'STATUS'].concat(days.map(function(day) {
    return '"' + day + '"';
  })).join(',');
  var query = [
    'select=' + encodeURIComponent(select),
    'TURMA=' + encodeURIComponent('in.(' + rooms.map(formatPostgrestValue_).join(',') + ')'),
    'limit=1000',
    'order=' + encodeURIComponent('MAT.asc')
  ].join('&');
  var response = UrlFetchApp.fetch(
    baseUrl + '/rest/v1/' + encodeURIComponent(tableName) + '?' + query,
    {
      method: 'get',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + anonKey,
        Accept: 'application/json'
      },
      muteHttpExceptions: true
    }
  );

  var status = response.getResponseCode();
  var body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase retornou HTTP ' + status + ': ' + body.slice(0, 300));
  }

  var rows = JSON.parse(body);
  if (!Array.isArray(rows)) {
    throw new Error('A resposta do Supabase nao e uma lista de registros.');
  }
  return rows;
}

function normalizeDay_(value) {
  var day = String(value || '').trim();
  if (!/^(?:[1-9]|[12][0-9]|3[01])$/.test(day)) {
    throw new Error('O dia da chamada e invalido.');
  }
  return String(Number(day));
}

function findHeaderIndex_(headers, expected) {
  var normalizedExpected = String(expected).trim().toUpperCase();
  return headers.findIndex(function(header) {
    return String(header).trim().toUpperCase() === normalizedExpected;
  });
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error('O mes do relatorio nao foi informado.');
  }

  var request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error('A requisicao do relatorio nao e um JSON valido.');
  }

  return request || {};
}

function normalizeMonth_(value) {
  var raw = String(value || '').trim();
  var normalized = removeAccents_(raw).toLowerCase();
  var months = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  var number = /^([1-9]|1[0-2])$/.test(normalized) ? Number(normalized) : months.indexOf(normalized) + 1;

  if (!number) {
    throw new Error('Selecione um mes valido para o relatorio.');
  }

  var sheetNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return {
    number: number,
    label: months[number - 1],
    sheetName: sheetNames[number - 1]
  };
}

function getMonthSheetName_(month) {
  return month.sheetName;
}

function removeAccents_(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isDayColumn_(column) {
  return /^(?:[1-9]|[12][0-9]|3[01])$/.test(String(column));
}

function getStatusForMonth_(value, monthNumber) {
  var monthSuffix = ':' + monthNumber;
  var tokens = String(value).split(',').map(function(token) {
    return token.trim();
  });

  for (var index = 0; index < tokens.length; index += 1) {
    var token = tokens[index];
    if (token.slice(-monthSuffix.length) === monthSuffix) {
      return token.slice(0, -monthSuffix.length).trim();
    }
  }

  return '';
}

function getSheetMatriculas_(sheet) {
  var lastColumn = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = lastColumn > 0
    ? sheet.getRange(HEADER_ROW, 1, 1, lastColumn).getDisplayValues()[0]
    : [];
  var matColumn = headers.findIndex(function(header) {
    return String(header).trim().toUpperCase() === 'MAT';
  });

  if (matColumn === -1) {
    throw new Error('A coluna MAT nao foi encontrada na planilha.');
  }

  var matriculas = {};
  var dataRowCount = Math.max(0, lastRow - HEADER_ROW);
  var values = dataRowCount
    ? sheet.getRange(HEADER_ROW + 1, 1, dataRowCount, lastColumn).getDisplayValues()
    : [];
  values.forEach(function(row) {
    var matricula = String(row[matColumn] || '').trim();
    if (matricula) {
      matriculas[matricula] = true;
    }
  });

  return Object.keys(matriculas);
}

function fetchAllRows_(baseUrl, anonKey, tableName, columns, matriculas) {
  var rows = [];
  var pageSize = 1000;
  var offset = 0;
  var select = columns.map(function(column) {
    return /^[0-9]+$/.test(column) ? '"' + column + '"' : column;
  }).join(',');

  if (!matriculas.length) {
    return rows;
  }

  while (true) {
    var query = [
      'select=' + encodeURIComponent(select),
      'MAT=' + encodeURIComponent('in.(' + matriculas.map(formatPostgrestValue_).join(',') + ')'),
      'limit=' + pageSize,
      'offset=' + offset,
      'order=' + encodeURIComponent('MAT.asc')
    ].join('&');
    var response = UrlFetchApp.fetch(
      baseUrl + '/rest/v1/' + encodeURIComponent(tableName) + '?' + query,
      {
        method: 'get',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + anonKey,
          Accept: 'application/json'
        },
        muteHttpExceptions: true
      }
    );

    var status = response.getResponseCode();
    var body = response.getContentText();
    if (status < 200 || status >= 300) {
      throw new Error('Supabase retornou HTTP ' + status + ': ' + body.slice(0, 300));
    }

    var page = JSON.parse(body);
    if (!Array.isArray(page)) {
      throw new Error('A resposta do Supabase nao e uma lista de registros.');
    }

    rows = rows.concat(page);
    if (page.length < pageSize) {
      return rows;
    }
    offset += pageSize;
  }
}

function formatPostgrestValue_(value) {
  if (/^(0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }

  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function requiredProperty_(properties, key) {
  var value = properties.getProperty(key);
  if (!value) {
    throw new Error('Configure a propriedade do script ' + key + '.');
  }
  return value.trim();
}
