import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch,Mock
import urllib.parse

from expo_links import ExpoLinks,LABELS
from remote_panel import RemotePanel
import test_bridge as fixtures


def manifest(port):
    return {'extra':{'expoClient':{'name':LABELS[port][2],'sdkVersion':'58.0.0','slug':'go-app',
                                 'hostUri':f'100.64.0.1:{port}'},
                     'expoGo':{'debuggerHost':f'100.64.0.1:{port}'},'scopeKey':'unchanged-shared-scope'},
            'launchAsset':{'url':f'http://100.64.0.1:{port}/entry.bundle?platform=ios&dev=true'}}


class ExpoLinkTests(unittest.TestCase):
    def setUp(self):self.links=ExpoLinks('100.64.0.1','desktop.test.ts.net')

    def test_launch_urls_have_distinct_authorities_ports_and_native_discriminators(self):
        urls=[urllib.parse.urlsplit(self.links.url(p)) for p in (8088,8089)]
        self.assertEqual([u.port for u in urls],[8088,8089])
        self.assertNotEqual(urls[0].hostname,urls[1].hostname)
        self.assertEqual([urllib.parse.parse_qs(u.query)['release-channel'][0] for u in urls],
                         ['go-cola-terminada-8088','go-comprobaciones-8089'])
        self.assertTrue(all(u.scheme=='exp' and not u.path for u in urls))

    def test_no_arbitrary_destination_can_be_configured(self):
        for address,host in [('127.0.0.1','desktop.test.ts.net'),('100.64.0.1','outside.invalid')]:
            with self.assertRaises(ValueError):ExpoLinks(address,host)
        with self.assertRaises(ValueError):self.links.url(8081)

    def test_both_real_contracts_keep_their_shared_identity_and_separate_routes(self):
        with patch.object(self.links,'fetch',side_effect=manifest):status=self.links.status()
        self.assertTrue(status['shared_scope'])
        for port,(key,_,_,_) in LABELS.items():
            self.assertTrue(status['links'][key]['available'])
            self.assertEqual(urllib.parse.urlsplit(status['links'][key]['url']).port,port)

    def test_owner_never_falls_back_to_main_when_wrong_manifest_is_returned(self):
        with patch.object(self.links,'fetch',return_value=manifest(8088)):
            status=self.links.status()
        self.assertTrue(status['links']['main']['available'])
        self.assertFalse(status['links']['owner']['available'])
        self.assertIsNone(status['links']['owner']['url'])

    def test_correct_name_with_wrong_bundle_port_is_rejected(self):
        data=manifest(8089);data['launchAsset']['url']=manifest(8088)['launchAsset']['url']
        with self.assertRaises(ValueError):self.links.validate(8089,data)

    def test_owner_port_cannot_serve_the_main_project_directory_silently(self):
        links=ExpoLinks('100.64.0.1','desktop.test.ts.net','C:/owner/artifacts/go-app-mobile')
        data=manifest(8089);data['extra']['expoGo']['developer']={'projectRoot':'C:/main/artifacts/go-app-mobile'}
        with self.assertRaises(ValueError):links.validate(8089,data)
        data['extra']['expoGo']['developer']['projectRoot']='C:\\owner\\artifacts\\go-app-mobile'
        links.validate(8089,data)

    def test_mismatched_debugger_and_host_uri_ports_are_rejected(self):
        for key in ('debuggerHost','hostUri'):
            data=manifest(8089)
            data['extra']['expoGo' if key=='debuggerHost' else 'expoClient'][key]='100.64.0.1:8088'
            with self.assertRaises(ValueError):self.links.validate(8089,data)

    def test_external_bundle_and_wrong_sdk_are_rejected(self):
        data=manifest(8089);data['launchAsset']['url']='http://outside.invalid:8089/entry.bundle?platform=ios'
        with self.assertRaises(ValueError):self.links.validate(8089,data)
        data=manifest(8089);data['extra']['expoClient']['sdkVersion']='57.0.0'
        with self.assertRaises(ValueError):self.links.validate(8089,data)

    def test_redirect_is_not_followed_even_to_another_live_environment(self):
        response=Mock(status=302)
        response.getheader.return_value='http://100.64.0.1:8088'
        with patch('expo_links.http.client.HTTPConnection') as connect:
            connect.return_value.getresponse.return_value=response
            with self.assertRaises(ValueError):self.links.fetch(8089)
            self.assertEqual(connect.call_count,1)
            self.assertEqual(connect.call_args.args,('desktop.test.ts.net',8089))
            connect.return_value.close.assert_called_once()

    def test_fetch_uses_exact_launch_query_and_platform_without_redirect_client(self):
        response=Mock(status=200)
        response.getheader.return_value=None
        response.read.return_value=json.dumps(manifest(8089)).encode()
        with patch('expo_links.http.client.HTTPConnection') as connect:
            connect.return_value.getresponse.return_value=response
            self.links.fetch(8089)
            args=connect.return_value.request.call_args
            self.assertEqual(args.args[:2],('GET','/?release-channel=go-comprobaciones-8089'))
            self.assertEqual(args.kwargs['headers']['Expo-Platform'],'ios')

    def test_failed_recheck_removes_old_owner_link_instead_of_reusing_it(self):
        with patch.object(self.links,'fetch',side_effect=manifest):self.links.status()
        with patch.object(self.links,'fetch',side_effect=OSError):status=self.links.status(force=True)
        self.assertTrue(all(not item['available'] and item['url'] is None for item in status['links'].values()))


class PanelLinkTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown

    def test_old_panel_compatibility_uses_new_verified_owner_url_without_running_wheel(self):
        panel=RemotePanel(self.bridge);panel.config={'hostname':'desktop.test.ts.net'}
        links=ExpoLinks('100.64.0.1','desktop.test.ts.net')
        with patch.object(links,'fetch',side_effect=manifest):verified=links.status()
        with patch('owner_expo.OwnerExpo.load',return_value={'host':'100.64.0.1'}), \
             patch('owner_expo.OwnerExpo.status',return_value={'state':'verified','url':'exp://100.64.0.1:8089'}), \
             patch('expo_links.ExpoLinks.status',return_value=verified):
            snapshot=panel.snapshot()
        self.assertEqual(snapshot['expo']['url'],links.url(8089))
        self.assertFalse(snapshot['wheel']['enabled'])
        self.assertFalse(self.bridge.factory.wheel.enabled())
