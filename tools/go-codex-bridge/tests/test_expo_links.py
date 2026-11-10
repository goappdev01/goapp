import json,unittest,urllib.parse
from unittest.mock import patch,Mock
from expo_links import ExpoLinks,LABELS
from remote_panel import RemotePanel
import test_bridge as fixtures

def manifest(port):
 return {'extra':{'expoClient':{'name':LABELS[port][2],'sdkVersion':'58.0.0','slug':'go-app','hostUri':f'100.64.0.1:{port}'},'expoGo':{'debuggerHost':f'100.64.0.1:{port}'},'scopeKey':'same-scope'},'launchAsset':{'url':f'http://100.64.0.1:{port}/entry.bundle?platform=ios'}}
ASSET={'__packager_asset':True,'httpServerLocation':'/assets/?unstable_path=./fonts','name':'Inter_400Regular','type':'ttf','scales':[1],'hash':'synthetic'}
BUNDLE=b'var test='+b'x'*1100+b'; register.registerAsset('+json.dumps(ASSET).encode()+b');'

class ExpoLinkTests(unittest.TestCase):
 def setUp(self):self.links=ExpoLinks('100.64.0.1','desktop.test.ts.net')
 def run_probe(self,fetch=manifest,**kwargs):
  with patch.object(self.links,'fetch',side_effect=fetch),patch.object(self.links,'resource',return_value=BUNDLE),patch.object(self.links,'request',return_value=b'asset'),patch.object(self.links,'websocket',return_value=True):
   return self.links.status(force=True)
 def test_urls_use_official_ipv4_and_only_the_matching_port(self):
  for p in LABELS:
   u=urllib.parse.urlsplit(self.links.url(p));self.assertEqual(u.hostname,'100.64.0.1');self.assertEqual(u.port,p);self.assertEqual(u.query,'')
 def test_no_arbitrary_destination(self):
  with self.assertRaises(ValueError):ExpoLinks('127.0.0.1','desktop.test.ts.net')
  with self.assertRaises(ValueError):self.links.url(8081)
 def test_metadata_alone_cannot_mark_available_and_real_resource_proof_is_not_iphone_proof(self):
  status=self.run_probe()
  for key in ('main','owner'):
   item=status['links'][key];self.assertTrue(item['available']);self.assertEqual(item['iphone_validation'],'pending')
   diagnostic=json.loads(item['diagnostic']);self.assertEqual(diagnostic['checks']['assets_downloaded'],1);self.assertGreater(diagnostic['checks']['bundle_bytes'],1000);self.assertIn('PC',item['message'])
 def test_wrong_owner_manifest_never_falls_back_to_main(self):
  s=self.run_probe(fetch=lambda p:manifest(8088));self.assertTrue(s['links']['main']['available']);self.assertFalse(s['links']['owner']['available']);self.assertIsNone(s['links']['owner']['url'])
 def test_wrong_bundle_port_rejected(self):
  m=manifest(8089);m['launchAsset']['url']=manifest(8088)['launchAsset']['url']
  with self.assertRaises(ValueError):self.links.validate(8089,m)
 def test_owner_wrong_directory_rejected(self):
  self.links.owner_root='c:/owner';m=manifest(8089);m['extra']['expoGo']['developer']={'projectRoot':'C:/main'}
  with self.assertRaises(ValueError):self.links.validate(8089,m)
 def test_wrong_debugger_and_dns_bundle_rejected(self):
  for field in ('debuggerHost','hostUri'):
   m=manifest(8089);m['extra']['expoGo' if field=='debuggerHost' else 'expoClient'][field]='100.64.0.1:8088'
   with self.assertRaises(ValueError):self.links.validate(8089,m)
  m=manifest(8089);m['launchAsset']['url']='http://desktop.test.ts.net:8089/entry.bundle?platform=ios'
  with self.assertRaises(ValueError):self.links.validate(8089,m)
 def test_fetch_uses_expo_official_open_endpoint_and_preserves_no_automation_flags(self):
  replies=[json.dumps({'runtime':'expo','url':'exp://100.64.0.1:8089?__expo_disable_fab=1'}).encode(),json.dumps(manifest(8089)).encode()]
  with patch.object(self.links,'request',side_effect=replies) as request:
   self.links.fetch(8089);self.assertEqual(request.call_args_list[0].args[1],'/_expo/open?platform=ios&runtime=expo');self.assertEqual(self.links.url(8089),'exp://100.64.0.1:8089')
 def test_official_endpoint_cannot_redirect_to_main(self):
  reply=json.dumps({'runtime':'expo','url':'exp://100.64.0.1:8088'}).encode()
  with patch.object(self.links,'request',return_value=reply):
   with self.assertRaises(ValueError):self.links.fetch(8089)
 def test_http_redirect_is_not_followed_and_dns_is_not_overridden(self):
  r=Mock(status=302);r.getheader.return_value='http://100.64.0.1:8088'
  with patch('expo_links.http.client.HTTPConnection') as c:
   c.return_value.getresponse.return_value=r
   with self.assertRaises(ValueError):self.links.request(8089,'/',1000)
   self.assertEqual(c.call_args.args,('100.64.0.1',8089));self.assertEqual(c.call_count,1)
 def test_incomplete_bundle_or_failed_asset_is_a_failure_with_copyable_stage(self):
  for failure in ('bundle','asset'):
   with patch.object(self.links,'fetch',side_effect=manifest),patch.object(self.links,'resource',return_value=b'' if failure=='bundle' else BUNDLE),patch.object(self.links,'request',side_effect=OSError('synthetic timeout')):
    item=self.links.probe(8089)[1];self.assertFalse(item['available']);self.assertIn('descarga',item['message']);self.assertTrue(json.loads(item['diagnostic'])['checks'].get('error'))
 def test_asset_paths_keep_necessary_fonts_platform_and_exact_port(self):
  paths=self.links.assets(BUNDLE);q=urllib.parse.parse_qs(urllib.parse.urlsplit(paths[0]).query);self.assertEqual(q['unstable_path'],['./fonts/Inter_400Regular.ttf']);self.assertEqual(q['platform'],['ios'])
  with self.assertRaises(ValueError):self.links.resource(8089,'http://100.64.0.1:8088/asset.ttf',1000)
 def test_missing_firewall_permission_is_not_reported_ready(self):
  self.links.device_check=lambda:{'allowed':False,'reason':'limited rule missing'}
  s=self.run_probe();self.assertFalse(s['links']['owner']['available']);self.assertTrue(s['links']['main']['available']);self.assertIn('permiso',s['links']['owner']['message'])
 def test_recheck_clears_old_success_and_does_not_claim_remote_validation(self):
  self.run_probe()
  with patch.object(self.links,'fetch',side_effect=OSError('unreachable')):s=self.links.status(force=True)
  self.assertTrue(all(not v['available'] and v['url'] is None for v in s['links'].values()))

class PanelLinkTests(unittest.TestCase):
 setUp=fixtures.BridgeTests.setUp
 tearDown=fixtures.BridgeTests.tearDown
 def test_old_panel_url_is_corrected_without_running_factory(self):
  panel=RemotePanel(self.bridge);panel.config={'hostname':'desktop.test.ts.net'}
  verified={'checked_at':0,'expires_at':1000,'links':{'owner':{'url':'exp://100.64.0.1:8089'}}}
  with patch('owner_expo.OwnerExpo.load',return_value={'host':'100.64.0.1'}),patch('owner_expo.OwnerExpo.status',return_value={'state':'verified','url':'exp://old.invalid:8089'}),patch('expo_links.ExpoLinks.status',return_value=verified):s=panel.snapshot()
  self.assertEqual(s['expo']['url'],'exp://100.64.0.1:8089');self.assertFalse(s['wheel']['enabled'])
 def test_wrong_pinned_head_cannot_be_opened_as_the_selected_version(self):
  panel=RemotePanel(self.bridge);panel.config={'hostname':'desktop.test.ts.net'}
  links={'checked_at':0,'expires_at':1000,'links':{'owner':{'available':True,'url':'exp://100.64.0.1:8089'}}}
  with patch('owner_expo.OwnerExpo.load',return_value={'host':'100.64.0.1'}),patch('owner_expo.OwnerExpo.status',return_value={'state':'not_verified','sha':'a'*40,'head':'b'*40}),patch('expo_links.ExpoLinks.status',return_value=links):s=panel.snapshot()
  self.assertIsNone(s['expo']['url']);self.assertFalse(s['expo_launches']['links']['owner']['available'])
